import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OWNER = process.env.REPORT_OWNER || "nexu-io";
const REPO = process.env.REPORT_REPO || "open-design";
const OUT_DIR = "preview";
const EVENTS_CSV = join(OUT_DIR, "contributor-card-events.csv");
const SUMMARY_JSON = join(OUT_DIR, "contributor-card-summary.json");
const REPORT_MD = join(OUT_DIR, "contributor-card-funnel-report.md");
const X_TEMPLATE_CSV = join(OUT_DIR, "x-share-manual-import-template.csv");

type IssueComment = {
  id: number;
  html_url: string;
  body?: string;
  created_at: string;
  user?: { login?: string };
};

type CardEvent = {
  createdAt: string;
  recipient: string;
  tierName: string;
  tierKey: string;
  surface: "issue" | "pull_request";
  threadNumber: number;
  threadUrl: string;
  commentUrl: string;
  cardUrl: string;
  eventId: string;
  dedupeKey: string;
  duplicateKind: "unique" | "historical_duplicate_burst";
};

function authHeaders(): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function githubJson<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function githubPaginated<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const rows = await githubJson<T[]>(`${path}${sep}per_page=100&page=${page}`);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
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

function parseThread(url: string): { surface: "issue" | "pull_request"; threadNumber: number; threadUrl: string } | null {
  const match = url.match(/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/(\d+)/);
  if (!match) return null;
  const surface = match[1] === "pull" ? "pull_request" : "issue";
  return {
    surface,
    threadNumber: Number(match[2]),
    threadUrl: url.split("#")[0] || url,
  };
}

function tierKeyFromName(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("da vinci")) return "spark";
  if (normalized.includes("giotto")) return "signal";
  if (normalized.includes("praxiteles")) return "node";
  if (normalized.includes("phidias")) return "beacon";
  if (normalized.includes("imhotep")) return "nova";
  return normalized.replace(/[^a-z0-9]+/g, "-") || "unknown";
}

function parseCardComment(comment: IssueComment): CardEvent | null {
  if (!comment.user?.login?.startsWith("open-design-bot")) return null;
  const body = comment.body || "";
  const img = body.match(/<img[^>]+src="([^"]+data\/cards\/([^"]+\.png))"[^>]*>/i);
  if (!img) return null;
  const recipient = body.match(/@([a-zA-Z0-9-]+)/)?.[1];
  if (!recipient) return null;
  const thread = parseThread(comment.html_url);
  if (!thread) return null;
  const cardUrl = img[1]!;
  const eventId = img[2]!.replace(/\.png$/, "");
  const tierName = body.match(/leveled up to \*\*([^*]+)\*\*/i)?.[1]
    || body.match(/alt="([^"]+) card for/i)?.[1]
    || eventId.split("-").at(-2)
    || "unknown";
  const tierKey = tierKeyFromName(tierName);
  const bucket = Math.floor(new Date(comment.created_at).getTime() / (5 * 60 * 1000));
  return {
    createdAt: comment.created_at,
    recipient,
    tierName,
    tierKey,
    surface: thread.surface,
    threadNumber: thread.threadNumber,
    threadUrl: thread.threadUrl,
    commentUrl: comment.html_url,
    cardUrl,
    eventId,
    dedupeKey: `${recipient.toLowerCase()}:${tierKey}:${thread.surface}:${bucket}`,
    duplicateKind: "unique",
  };
}

function dedupeEvents(events: CardEvent[]): CardEvent[] {
  const seen = new Set<string>();
  return events.map((event) => {
    const duplicateKind = seen.has(event.dedupeKey) ? "historical_duplicate_burst" : "unique";
    seen.add(event.dedupeKey);
    return { ...event, duplicateKind };
  });
}

function countBy<T extends string>(items: T[]): Record<T, number> {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const comments = await githubPaginated<IssueComment>(`/repos/${OWNER}/${REPO}/issues/comments?sort=created&direction=asc`);
  const rawEvents = comments.map(parseCardComment).filter((event): event is CardEvent => Boolean(event));
  const events = dedupeEvents(rawEvents);
  const dedupedEvents = events.filter((event) => event.duplicateKind === "unique");
  const duplicateEvents = events.filter((event) => event.duplicateKind !== "unique");
  const uniqueRecipients = new Set(dedupedEvents.map((event) => event.recipient.toLowerCase()));
  const rawRecipients = new Set(events.map((event) => event.recipient.toLowerCase()));
  const duplicateRecipients = countBy(duplicateEvents.map((event) => event.recipient.toLowerCase()));

  const eventRows = events.map((event) => ({
    ...event,
    shareUrl: `https://open-design.ai/share/${encodeURIComponent(event.eventId)}`,
  }));
  writeFileSync(EVENTS_CSV, `${toCsv(eventRows, [
    "createdAt",
    "recipient",
    "tierKey",
    "tierName",
    "surface",
    "threadNumber",
    "threadUrl",
    "commentUrl",
    "cardUrl",
    "eventId",
    "dedupeKey",
    "duplicateKind",
    "shareUrl",
  ])}\n`);

  const summary = {
    generatedAt: new Date().toISOString(),
    repository: `${OWNER}/${REPO}`,
    rawCardComments: events.length,
    dedupedCardEvents: dedupedEvents.length,
    historicalDuplicateCount: duplicateEvents.length,
    rawUniqueRecipients: rawRecipients.size,
    uniqueRecipients: uniqueRecipients.size,
    duplicateRecipients,
    byDay: countBy(dedupedEvents.map((event) => dayOf(event.createdAt))),
    byTier: countBy(dedupedEvents.map((event) => event.tierName)),
    bySurface: countBy(dedupedEvents.map((event) => event.surface)),
  };
  writeFileSync(SUMMARY_JSON, `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(X_TEMPLATE_CSV, "eventId,xPostUrl,xAuthor,postedAt,impressions,likes,reposts,replies,bookmarks,githubClicks,notes\n");
  writeFileSync(REPORT_MD, [
    "# Contributor Card Funnel Report",
    "",
    `Generated at: ${summary.generatedAt}`,
    `Repository: \`${summary.repository}\``,
    "",
    "## Summary",
    "",
    `- Deduped card events: ${summary.dedupedCardEvents}`,
    `- Raw bot card comments: ${summary.rawCardComments}`,
    `- Historical duplicate burst events: ${summary.historicalDuplicateCount}`,
    `- Unique recipients: ${summary.uniqueRecipients}`,
    "",
  ].join("\n"));
  console.log(`Wrote ${EVENTS_CSV}`);
  console.log(`Wrote ${SUMMARY_JSON}`);
  console.log(`Wrote ${X_TEMPLATE_CSV}`);
  console.log(`Wrote ${REPORT_MD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
