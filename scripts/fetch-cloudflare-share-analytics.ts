/**
 * Pulls /share/* and /share-out/* click counts out of Cloudflare's
 * `pagesFunctionsInvocationsAdaptiveGroups` GraphQL dataset and writes
 * three sibling files to `preview/`:
 *
 *   share-analytics.json   - machine-readable (stable schema, used by
 *                            downstream dashboards / BI tools)
 *   share-analytics.csv    - same data flat, for Sheets / Excel imports
 *   share-analytics.md     - quick human summary, embedded in the
 *                            generated dashboard HTML
 *
 * Inputs (env):
 *   CLOUDFLARE_API_TOKEN    - token with Account → Analytics → Read
 *   CLOUDFLARE_ACCOUNT_ID   - default falls back to the Open Design
 *                              account id so the script also works
 *                              locally without the env var
 *
 * Notes:
 *  - `pagesFunctionsInvocationsAdaptiveGroups` only exposes
 *    {date, status, scriptName} as dimensions, so we cannot break clicks
 *    down by URL path or eventId from this dataset alone. The current
 *    open-design-landing project only ships two functions
 *    (/share/[eventId].ts and /share-out/[eventId].ts), so the totals
 *    here are a reliable proxy for combined share funnel traffic.
 *  - The /share/* function went live on 2026-05-22; numbers before that
 *    date are structural zeros, not "no traffic".
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "preview";
const OUT_JSON = join(OUT_DIR, "share-analytics.json");
const OUT_CSV = join(OUT_DIR, "share-analytics.csv");
const OUT_MD = join(OUT_DIR, "share-analytics.md");

const DEFAULT_ACCOUNT_ID = "64ad4569ffd912432d6b86d5656484c4";
const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const FUNCTION_LIVE_FROM = "2026-05-22";

type DailyPoint = { date: string; clicks: number; errors: number };

type CloudflareRow = {
  sum: { requests: number };
  dimensions: { date: string; status: string; scriptName: string };
};

type CloudflareResponse = {
  data?: {
    viewer?: {
      accounts?: Array<{
        pagesFunctionsInvocationsAdaptiveGroups?: CloudflareRow[];
      }>;
    };
  };
  errors?: Array<{ message: string }>;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

async function queryWindow(
  token: string,
  accountId: string,
  windowDays: number,
): Promise<DailyPoint[]> {
  const since = isoDaysAgo(windowDays);
  const until = new Date().toISOString();
  const query = `query($a:string!,$s:Time!,$u:Time!){
    viewer {
      accounts(filter:{accountTag:$a}) {
        pagesFunctionsInvocationsAdaptiveGroups(
          filter:{datetime_geq:$s,datetime_leq:$u},
          limit:1000,
          orderBy:[sum_requests_DESC]
        ) {
          sum { requests }
          dimensions { date status scriptName }
        }
      }
    }
  }`;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { a: accountId, s: since, u: until } }),
  });
  if (!res.ok) {
    throw new Error(`Cloudflare GraphQL HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as CloudflareResponse;
  if (json.errors?.length) {
    throw new Error(`Cloudflare GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  const rows =
    json.data?.viewer?.accounts?.[0]?.pagesFunctionsInvocationsAdaptiveGroups ?? [];

  const byDate = new Map<string, DailyPoint>();
  for (const r of rows) {
    const point = byDate.get(r.dimensions.date) ?? {
      date: r.dimensions.date,
      clicks: 0,
      errors: 0,
    };
    if (r.dimensions.status === "success") {
      point.clicks += r.sum.requests;
    } else {
      point.errors += r.sum.requests;
    }
    byDate.set(r.dimensions.date, point);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function sum(points: DailyPoint[], key: "clicks" | "errors"): number {
  return points.reduce((acc, p) => acc + p[key], 0);
}

function toCsv(points: DailyPoint[]): string {
  const header = "date,clicks,errors";
  const body = points.map((p) => `${p.date},${p.clicks},${p.errors}`).join("\n");
  return `${header}\n${body}\n`;
}

function toMarkdown(generatedAt: string, window30: DailyPoint[]): string {
  const total30 = sum(window30, "clicks");
  const lines: string[] = [];
  lines.push("# Open Design — X share funnel clicks");
  lines.push("");
  lines.push(`Generated: \`${generatedAt}\``);
  lines.push(
    `Source: Cloudflare \`pagesFunctionsInvocationsAdaptiveGroups\` for project \`open-design-landing\`.`,
  );
  lines.push("");
  lines.push(
    `> Counts all Cloudflare Pages Function invocations on \`open-design.ai\`. ` +
      `Today that means \`/share/:eventId\` + \`/share-out/:eventId\` combined. ` +
      `Function went live on ${FUNCTION_LIVE_FROM}; earlier dates are structural zeros.`,
  );
  lines.push("");
  lines.push(`## Totals`);
  lines.push("");
  lines.push(`- **Last 30 days**: ${total30} click(s)`);
  lines.push("");
  lines.push(`## Last 30 days, by date`);
  lines.push("");
  lines.push(`| date | clicks | errors |`);
  lines.push(`|---|---:|---:|`);
  for (const p of window30) {
    lines.push(`| ${p.date} | ${p.clicks} | ${p.errors} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN env var is required (token needs Account → Analytics → Read).",
    );
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;

  const generatedAt = nowIso();
  // Cloudflare's adaptive groups dataset caps a single query at ~4w4d, so
  // 30d is the widest practical window. If we need a longer history later
  // we can stitch successive 28d windows together.
  const window30 = await queryWindow(token, accountId, 30);

  const payload = {
    generatedAt,
    source: "cloudflare-pages-functions",
    project: "open-design-landing",
    accountId,
    functionLiveFrom: FUNCTION_LIVE_FROM,
    note:
      "Counts all Cloudflare Pages Function invocations on open-design.ai " +
      "(today: /share/:eventId + /share-out/:eventId). " +
      "Pre-functionLiveFrom dates are structural zeros, not no-traffic.",
    windows: {
      last30Days: {
        totalClicks: sum(window30, "clicks"),
        totalErrors: sum(window30, "errors"),
        daily: window30,
      },
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + "\n");
  writeFileSync(OUT_CSV, toCsv(window30));
  writeFileSync(OUT_MD, toMarkdown(generatedAt, window30));
  console.log(`Wrote ${OUT_JSON} (last30=${sum(window30, "clicks")})`);
  console.log(`Wrote ${OUT_CSV}`);
  console.log(`Wrote ${OUT_MD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
