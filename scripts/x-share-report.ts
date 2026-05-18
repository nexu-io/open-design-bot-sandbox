import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "preview";
const INPUT_CSV = join(OUT_DIR, "x-share-manual-import-template.csv");
const SUMMARY_CSV = join(OUT_DIR, "x-share-summary.csv");
const REPORT_MD = join(OUT_DIR, "x-share-report.md");

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const headers = (lines.shift() || "").split(",");
  return lines
    .filter(Boolean)
    .map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split(",")[index] || ""])));
}

function numberFrom(value: string | undefined): number {
  const parsed = Number((value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function tweetIdFromUrl(url: string | undefined): string | null {
  const match = (url || "").match(/\/status\/(\d+)/);
  return match?.[1] || null;
}

async function enrichFromXApi(rows: Record<string, string>[]): Promise<"configured" | "not_configured" | "failed"> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return "not_configured";
  const ids = rows.map((row) => tweetIdFromUrl(row.xPostUrl)).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return "configured";
  try {
    const res = await fetch(
      `https://api.twitter.com/2/tweets?ids=${encodeURIComponent(ids.join(","))}&tweet.fields=public_metrics`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      console.warn(`X API enrichment skipped: ${res.status} ${await res.text()}`);
      return "failed";
    }
    const json = await res.json() as {
      data?: Array<{
        id: string;
        public_metrics?: {
          like_count?: number;
          retweet_count?: number;
          reply_count?: number;
          quote_count?: number;
          bookmark_count?: number;
        };
      }>;
    };
    const metricsById = new Map((json.data || []).map((tweet) => [tweet.id, tweet.public_metrics || {}]));
    for (const row of rows) {
      const id = tweetIdFromUrl(row.xPostUrl);
      if (!id) continue;
      const metrics = metricsById.get(id);
      if (!metrics) continue;
      row.likes ||= String(metrics.like_count || 0);
      row.reposts ||= String((metrics.retweet_count || 0) + (metrics.quote_count || 0));
      row.replies ||= String(metrics.reply_count || 0);
      row.bookmarks ||= String(metrics.bookmark_count || 0);
    }
    return "configured";
  } catch (error) {
    console.warn("X API enrichment failed:", error);
    return "failed";
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = existsSync(INPUT_CSV) ? parseCsv(readFileSync(INPUT_CSV, "utf8")).filter((row) => row.xPostUrl) : [];
  const xApiStatus = await enrichFromXApi(rows);
  const impressions = rows.reduce((sum, row) => sum + numberFrom(row.impressions), 0);
  const engagements = rows.reduce(
    (sum, row) => sum + numberFrom(row.likes) + numberFrom(row.reposts) + numberFrom(row.replies) + numberFrom(row.bookmarks),
    0,
  );
  const clicks = rows.reduce((sum, row) => sum + numberFrom(row.githubClicks), 0);
  const uniqueAuthors = new Set(rows.map((row) => row.xAuthor).filter(Boolean));

  const summary = {
    x_posts_found: rows.length,
    x_unique_authors: uniqueAuthors.size,
    x_impressions_total: impressions,
    x_engagements_total: engagements,
    x_clicks_to_github: clicks,
    x_to_github_conversion: impressions > 0 ? `${((clicks / impressions) * 100).toFixed(2)}%` : "unavailable",
    x_api_status: xApiStatus,
  };
  writeFileSync(SUMMARY_CSV, `${Object.keys(summary).join(",")}\n${Object.values(summary).join(",")}\n`);
  writeFileSync(REPORT_MD, [
    "# X Share Report",
    "",
    `- X API status: ${xApiStatus}`,
    `- Posts found: ${summary.x_posts_found}`,
    `- Impressions: ${summary.x_impressions_total}`,
    `- Engagements: ${summary.x_engagements_total}`,
    `- GitHub clicks: ${summary.x_clicks_to_github}`,
    "",
    "If `X_BEARER_TOKEN` is not configured, this report uses the manual import CSV only.",
  ].join("\n"));
  console.log(`Wrote ${SUMMARY_CSV}`);
  console.log(`Wrote ${REPORT_MD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
