import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "preview";
const INPUT_CSV = join(OUT_DIR, "x-share-manual-import-template.csv");
const CARD_EVENTS_CSV = join(OUT_DIR, "contributor-card-events.csv");
const SUMMARY_CSV = join(OUT_DIR, "x-share-summary.csv");
const POSTS_CSV = join(OUT_DIR, "x-share-posts.csv");
const REPORT_MD = join(OUT_DIR, "x-share-report.md");
const SHARE_HOST = "open-design.ai";
const SHARE_PATH = "/share/";
const X_SEARCH_QUERY = process.env.X_SEARCH_QUERY || '"open-design.ai/share" OR "open-design.ai/share/" -is:retweet';

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

function tweetIdFromUrl(url: string | undefined): string | null {
  const match = (url || "").match(/\/status\/(\d+)/);
  return match?.[1] || null;
}

type CardEventRow = {
  eventId: string;
  recipient: string;
  tierName: string;
  commentUrl: string;
  cardUrl: string;
};

type XPostRow = {
  eventId: string;
  recipient: string;
  tierName: string;
  xAuthor: string;
  xUsername: string;
  xPostUrl: string;
  postedAt: string;
  likes: string;
  reposts: string;
  replies: string;
  bookmarks: string;
  impressions: string;
  githubClicks: string;
  matchedCardUrl: string;
  matchedCommentUrl: string;
  source: "x_api" | "manual";
  notes: string;
};

type XTweet = {
  id: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  entities?: {
    urls?: Array<{
      url?: string;
      expanded_url?: string;
      unwound_url?: string;
      display_url?: string;
    }>;
  };
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
};

type XUser = {
  id: string;
  name?: string;
  username?: string;
};

type XSearchResponse = {
  data?: XTweet[];
  includes?: { users?: XUser[] };
  meta?: { next_token?: string };
};

function readCardEvents(): Map<string, CardEventRow> {
  if (!existsSync(CARD_EVENTS_CSV)) return new Map();
  const rows = parseCsv(readFileSync(CARD_EVENTS_CSV, "utf8")) as unknown as CardEventRow[];
  return new Map(rows.filter((row) => row.eventId).map((row) => [row.eventId, row]));
}

function eventIdFromShareUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname !== SHARE_HOST || !url.pathname.startsWith(SHARE_PATH)) return null;
    const raw = url.pathname.slice(SHARE_PATH.length).split("/")[0] || "";
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    const match = value.match(/open-design\.ai\/share\/([a-zA-Z0-9._:%-]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}

function eventIdFromTweet(tweet: XTweet): string | null {
  for (const url of tweet.entities?.urls || []) {
    const match = eventIdFromShareUrl(url.unwound_url || url.expanded_url || url.url || url.display_url);
    if (match) return match;
  }
  return eventIdFromShareUrl(tweet.text);
}

function xPostUrl(username: string | undefined, tweetId: string): string {
  return `https://twitter.com/${username || "i"}/status/${tweetId}`;
}

function manualRows(cardEvents: Map<string, CardEventRow>): XPostRow[] {
  if (!existsSync(INPUT_CSV)) return [];
  return parseCsv(readFileSync(INPUT_CSV, "utf8"))
    .filter((row) => row.xPostUrl || row.eventId)
    .map((row) => {
      const eventId = row.eventId || eventIdFromShareUrl(row.notes) || "";
      const card = cardEvents.get(eventId);
      return {
        eventId,
        recipient: card?.recipient || "",
        tierName: card?.tierName || "",
        xAuthor: row.xAuthor || "",
        xUsername: row.xAuthor || "",
        xPostUrl: row.xPostUrl || "",
        postedAt: row.postedAt || "",
        likes: row.likes || "0",
        reposts: row.reposts || "0",
        replies: row.replies || "0",
        bookmarks: row.bookmarks || "0",
        impressions: row.impressions || "0",
        githubClicks: row.githubClicks || "0",
        matchedCardUrl: card?.cardUrl || "",
        matchedCommentUrl: card?.commentUrl || "",
        source: "manual",
        notes: row.notes || "",
      };
    });
}

async function searchXApi(cardEvents: Map<string, CardEventRow>): Promise<{ status: "configured" | "not_configured" | "failed"; rows: XPostRow[] }> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return { status: "not_configured", rows: [] };

  const rows: XPostRow[] = [];
  let nextToken: string | undefined;
  try {
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({
        query: X_SEARCH_QUERY,
        max_results: "100",
        "tweet.fields": "author_id,created_at,public_metrics,entities",
        expansions: "author_id",
        "user.fields": "username,name",
      });
      if (nextToken) params.set("next_token", nextToken);
      const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.warn(`X API recent search failed: ${res.status} ${await res.text()}`);
        return { status: "failed", rows };
      }

      const json = await res.json() as XSearchResponse;
      const usersById = new Map((json.includes?.users || []).map((user) => [user.id, user]));
      for (const tweet of json.data || []) {
        const eventId = eventIdFromTweet(tweet);
        if (!eventId) continue;
        const card = cardEvents.get(eventId);
        const user = tweet.author_id ? usersById.get(tweet.author_id) : undefined;
        const metrics = tweet.public_metrics || {};
        rows.push({
          eventId,
          recipient: card?.recipient || "",
          tierName: card?.tierName || "",
          xAuthor: user?.name || user?.username || tweet.author_id || "",
          xUsername: user?.username || "",
          xPostUrl: xPostUrl(user?.username, tweet.id),
          postedAt: tweet.created_at || "",
          likes: String(metrics.like_count || 0),
          reposts: String((metrics.retweet_count || 0) + (metrics.quote_count || 0)),
          replies: String(metrics.reply_count || 0),
          bookmarks: String(metrics.bookmark_count || 0),
          impressions: String(metrics.impression_count || 0),
          githubClicks: "0",
          matchedCardUrl: card?.cardUrl || "",
          matchedCommentUrl: card?.commentUrl || "",
          source: "x_api",
          notes: card ? "" : "No matching card event found",
        });
      }

      nextToken = json.meta?.next_token;
      if (!nextToken) break;
    }
    return { status: "configured", rows };
  } catch (error) {
    console.warn("X API recent search failed:", error);
    return { status: "failed", rows };
  }
}

function dedupePosts(rows: XPostRow[]): XPostRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.xPostUrl || `${row.eventId}:${row.xUsername}:${row.postedAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cardEvents = readCardEvents();
  const searched = await searchXApi(cardEvents);
  const rows = dedupePosts([...searched.rows, ...manualRows(cardEvents)])
    .sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""));
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
    x_api_status: searched.status,
  };
  writeFileSync(POSTS_CSV, `${toCsv(rows, [
    "eventId",
    "recipient",
    "tierName",
    "xAuthor",
    "xUsername",
    "xPostUrl",
    "postedAt",
    "likes",
    "reposts",
    "replies",
    "bookmarks",
    "impressions",
    "githubClicks",
    "matchedCardUrl",
    "matchedCommentUrl",
    "source",
    "notes",
  ])}\n`);
  writeFileSync(SUMMARY_CSV, `${Object.keys(summary).join(",")}\n${Object.values(summary).join(",")}\n`);
  writeFileSync(REPORT_MD, [
    "# X Share Report",
    "",
    `- X API status: ${searched.status}`,
    `- Search query: \`${X_SEARCH_QUERY}\``,
    `- Posts found: ${summary.x_posts_found}`,
    `- Unique authors: ${summary.x_unique_authors}`,
    `- Impressions: ${summary.x_impressions_total}`,
    `- Engagements: ${summary.x_engagements_total}`,
    `- GitHub clicks: ${summary.x_clicks_to_github}`,
    "",
    "If `X_BEARER_TOKEN` is not configured, this report uses the manual import CSV only. Public X API metrics usually do not include impressions unless the token has access to them.",
  ].join("\n"));
  console.log(`Wrote ${POSTS_CSV}`);
  console.log(`Wrote ${SUMMARY_CSV}`);
  console.log(`Wrote ${REPORT_MD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
