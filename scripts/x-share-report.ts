import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "preview";
const INPUT_CSV = join(OUT_DIR, "x-share-manual-import-template.csv");
const CARD_EVENTS_CSV = join(OUT_DIR, "contributor-card-events.csv");
const SUMMARY_CSV = join(OUT_DIR, "x-share-summary.csv");
const CLICKS_CSV = join(OUT_DIR, "share-click-events.csv");
const CLICK_SUMMARY_CSV = join(OUT_DIR, "share-click-summary.csv");
const REPORT_MD = join(OUT_DIR, "x-share-report.md");
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const CLICK_KEY_PREFIX = process.env.SHARE_CLICK_KV_PREFIX || "click:";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [headers = [], ...dataRows] = rows;
  return dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function numberFrom(value: string | undefined): number {
  const parsed = Number((value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

type CardEventRow = {
  eventId: string;
  recipient: string;
  tierName: string;
  commentUrl: string;
  cardUrl: string;
};

type ShareClickRecord = {
  eventId: string;
  clickedAt: string;
  destination: string;
  referer: string | null;
  userAgentHash: string;
  country?: string;
  region?: string;
};

type ShareClickRow = ShareClickRecord & {
  key: string;
  recipient: string;
  tierName: string;
  matchedCardUrl: string;
  matchedCommentUrl: string;
};

type ShareClickSummaryRow = {
  eventId: string;
  recipient: string;
  tierName: string;
  clicks: number;
  uniqueClickers: number;
  firstClickedAt: string;
  lastClickedAt: string;
  countries: string;
  topReferers: string;
  matchedCardUrl: string;
  matchedCommentUrl: string;
};

type CloudflareListKeysResponse = {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{ name: string }>;
  result_info?: { cursor?: string };
};

function readCardEvents(): Map<string, CardEventRow> {
  if (!existsSync(CARD_EVENTS_CSV)) return new Map();
  const rows = parseCsv(readFileSync(CARD_EVENTS_CSV, "utf8")) as unknown as CardEventRow[];
  return new Map(rows.filter((row) => row.eventId).map((row) => [row.eventId, row]));
}

function cloudflareConfig(): { accountId: string; namespaceId: string; token: string } | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.SHARE_CLICK_KV_NAMESPACE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
  if (!accountId || !namespaceId || !token) return null;
  return { accountId, namespaceId, token };
}

function cloudflareHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/json",
  };
}

async function listClickKeys(config: { accountId: string; namespaceId: string; token: string }): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "";
  for (let page = 0; page < 25; page++) {
    const params = new URLSearchParams({ prefix: CLICK_KEY_PREFIX, limit: "1000" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(
      `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/keys?${params.toString()}`,
      { headers: cloudflareHeaders(config.token) },
    );
    const json = await res.json() as CloudflareListKeysResponse;
    if (!res.ok || !json.success) {
      const message = json.errors?.map((error) => error.message).filter(Boolean).join("; ") || await res.text();
      throw new Error(`Cloudflare KV key list failed: ${res.status} ${message}`);
    }
    keys.push(...(json.result || []).map((key) => key.name));
    cursor = json.result_info?.cursor || "";
    if (!cursor) break;
  }
  return keys;
}

async function readClickValue(
  config: { accountId: string; namespaceId: string; token: string },
  key: string,
): Promise<ShareClickRecord | null> {
  const res = await fetch(
    `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${encodeURIComponent(key)}`,
    { headers: cloudflareHeaders(config.token) },
  );
  if (!res.ok) {
    console.warn(`Cloudflare KV value read skipped for ${key}: ${res.status} ${await res.text()}`);
    return null;
  }
  return await res.json() as ShareClickRecord;
}

async function fetchShareClicks(cardEvents: Map<string, CardEventRow>): Promise<{ status: "configured" | "not_configured" | "failed"; rows: ShareClickRow[] }> {
  const config = cloudflareConfig();
  if (!config) return { status: "not_configured", rows: [] };
  try {
    const keys = await listClickKeys(config);
    const rows: ShareClickRow[] = [];
    for (const key of keys) {
      const record = await readClickValue(config, key);
      if (!record?.eventId) continue;
      const card = cardEvents.get(record.eventId);
      rows.push({
        ...record,
        key,
        recipient: card?.recipient || "",
        tierName: card?.tierName || "",
        matchedCardUrl: card?.cardUrl || "",
        matchedCommentUrl: card?.commentUrl || "",
      });
    }
    return { status: "configured", rows };
  } catch (error) {
    console.warn("Share click fetch failed:", error);
    return { status: "failed", rows: [] };
  }
}

function aggregateClicks(rows: ShareClickRow[]): ShareClickSummaryRow[] {
  const byEvent = new Map<string, ShareClickRow[]>();
  for (const row of rows) {
    const current = byEvent.get(row.eventId) || [];
    current.push(row);
    byEvent.set(row.eventId, current);
  }

  return [...byEvent.entries()].map(([eventId, eventRows]) => {
    const sorted = [...eventRows].sort((a, b) => a.clickedAt.localeCompare(b.clickedAt));
    const uniqueClickers = new Set(eventRows.map((row) => row.userAgentHash).filter(Boolean));
    const countries = [...new Set(eventRows.map((row) => row.country).filter(Boolean))].sort();
    const refererCounts = eventRows.reduce((acc, row) => {
      const referer = row.referer || "direct";
      acc.set(referer, (acc.get(referer) || 0) + 1);
      return acc;
    }, new Map<string, number>());
    const topReferers = [...refererCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([referer, count]) => `${referer} (${count})`);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    return {
      eventId,
      recipient: first.recipient,
      tierName: first.tierName,
      clicks: eventRows.length,
      uniqueClickers: uniqueClickers.size,
      firstClickedAt: first.clickedAt,
      lastClickedAt: last.clickedAt,
      countries: countries.join("|"),
      topReferers: topReferers.join("|"),
      matchedCardUrl: first.matchedCardUrl,
      matchedCommentUrl: first.matchedCommentUrl,
    };
  }).sort((a, b) => b.lastClickedAt.localeCompare(a.lastClickedAt));
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cardEvents = readCardEvents();
  const clickResult = await fetchShareClicks(cardEvents);
  const clickRows = clickResult.rows.sort((a, b) => b.clickedAt.localeCompare(a.clickedAt));
  const clickSummaryRows = aggregateClicks(clickRows);
  const manualRows = existsSync(INPUT_CSV) ? parseCsv(readFileSync(INPUT_CSV, "utf8")).filter((row) => row.xPostUrl) : [];
  const impressions = manualRows.reduce((sum, row) => sum + numberFrom(row.impressions), 0);
  const engagements = manualRows.reduce(
    (sum, row) => sum + numberFrom(row.likes) + numberFrom(row.reposts) + numberFrom(row.replies) + numberFrom(row.bookmarks),
    0,
  );
  const manualClicks = manualRows.reduce((sum, row) => sum + numberFrom(row.githubClicks), 0);
  const clicks = clickRows.length + manualClicks;
  const uniqueAuthors = new Set(manualRows.map((row) => row.xAuthor).filter(Boolean));

  const summary = {
    x_posts_found: manualRows.length,
    x_unique_authors: uniqueAuthors.size,
    x_impressions_total: impressions,
    x_engagements_total: engagements,
    x_clicks_to_github: clicks,
    x_to_github_conversion: impressions > 0 ? `${((clicks / impressions) * 100).toFixed(2)}%` : "unavailable",
    x_api_status: clickResult.status,
    share_click_events: clickRows.length,
    share_clicked_cards: clickSummaryRows.length,
    share_unique_clickers: new Set(clickRows.map((row) => row.userAgentHash).filter(Boolean)).size,
  };
  writeFileSync(CLICKS_CSV, `${toCsv(clickRows, [
    "key",
    "eventId",
    "recipient",
    "tierName",
    "clickedAt",
    "destination",
    "referer",
    "country",
    "region",
    "matchedCardUrl",
    "matchedCommentUrl",
  ])}\n`);
  writeFileSync(CLICK_SUMMARY_CSV, `${toCsv(clickSummaryRows, [
    "eventId",
    "recipient",
    "tierName",
    "clicks",
    "uniqueClickers",
    "firstClickedAt",
    "lastClickedAt",
    "countries",
    "topReferers",
    "matchedCardUrl",
    "matchedCommentUrl",
  ])}\n`);
  writeFileSync(SUMMARY_CSV, `${Object.keys(summary).join(",")}\n${Object.values(summary).join(",")}\n`);
  writeFileSync(REPORT_MD, [
    "# Share Redirect Report",
    "",
    `- Share click status: ${clickResult.status}`,
    `- Share click events: ${summary.share_click_events}`,
    `- Clicked cards: ${summary.share_clicked_cards}`,
    `- Unique clickers: ${summary.share_unique_clickers}`,
    `- GitHub clicks: ${summary.x_clicks_to_github}`,
    "",
    "This report does not require X API access. It reads Cloudflare KV records created by `open-design.ai/share/:eventId` and keeps the manual X CSV as an optional supplement.",
  ].join("\n"));
  console.log(`Wrote ${CLICKS_CSV}`);
  console.log(`Wrote ${CLICK_SUMMARY_CSV}`);
  console.log(`Wrote ${SUMMARY_CSV}`);
  console.log(`Wrote ${REPORT_MD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
