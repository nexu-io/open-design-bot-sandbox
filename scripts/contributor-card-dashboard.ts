import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "preview";
const EVENTS_CSV = join(OUT_DIR, "contributor-card-events.csv");
const SUMMARY_JSON = join(OUT_DIR, "contributor-card-summary.json");
const X_SUMMARY_CSV = join(OUT_DIR, "x-share-summary.csv");
const X_POSTS_CSV = join(OUT_DIR, "x-share-posts.csv");
const OUTPUT_INDEX_HTML = join(OUT_DIR, "index.html");
const OUTPUT_HTML = join(OUT_DIR, "contributor-card-dashboard.html");

type CardEventRow = {
  createdAt: string;
  recipient: string;
  tierKey: string;
  tierName: string;
  surface: string;
  threadNumber: string;
  commentUrl: string;
  duplicateKind: string;
  shareUrl: string;
};

type Summary = {
  generatedAt: string;
  rawCardComments: number;
  dedupedCardEvents: number;
  historicalDuplicateCount: number;
  uniqueRecipients: number;
  rawUniqueRecipients: number;
  duplicateRecipients: Record<string, number>;
  byDay: Record<string, number>;
  byTier: Record<string, number>;
  bySurface: Record<string, number>;
};

type XSharePostRow = {
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
  matchedCommentUrl: string;
  source: string;
};

function requireFile(path: string) {
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run pnpm run report:all first.`);
}

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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stat(label: string, value: string | number, note: string, zh: string): string {
  return `<section class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}<br>${escapeHtml(zh)}</small></section>`;
}

function countRows(rows: Record<string, number>): string {
  const max = Math.max(1, ...Object.values(rows));
  return Object.entries(rows)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => `<div class="bar"><span>${escapeHtml(label)}</span><i><b style="width:${Math.max(4, (value / max) * 100).toFixed(1)}%"></b></i><strong>${value}</strong></div>`)
    .join("");
}

function recentRows(events: CardEventRow[]): string {
  return events.slice(-12).reverse().map((event) => `<tr>
    <td>${escapeHtml(event.createdAt.replace("T", " ").replace("Z", ""))}</td>
    <td>@${escapeHtml(event.recipient)}</td>
    <td>${escapeHtml(event.tierName)}</td>
    <td>${escapeHtml(event.surface)}</td>
    <td>${event.duplicateKind === "unique" ? "Unique" : "Historical duplicate"}</td>
    <td><a href="${escapeHtml(event.commentUrl)}">#${escapeHtml(event.threadNumber)}</a></td>
  </tr>`).join("");
}

function xShareRows(rows: XSharePostRow[]): string {
  if (rows.length === 0) {
    return `<tr><td colspan="8">No public X shares found yet. Add X_BEARER_TOKEN with recent-search access or use the manual CSV fallback.</td></tr>`;
  }
  return rows.slice(0, 12).map((row) => `<tr>
    <td>${escapeHtml(row.postedAt.replace("T", " ").replace("Z", ""))}</td>
    <td><a href="${escapeHtml(row.xPostUrl)}">@${escapeHtml(row.xUsername || row.xAuthor || "unknown")}</a></td>
    <td>@${escapeHtml(row.recipient || "unmatched")}</td>
    <td>${escapeHtml(row.tierName || "")}</td>
    <td>${escapeHtml(row.likes)}</td>
    <td>${escapeHtml(row.reposts)}</td>
    <td>${escapeHtml(row.replies)}</td>
    <td>${row.matchedCommentUrl ? `<a href="${escapeHtml(row.matchedCommentUrl)}">${escapeHtml(row.eventId)}</a>` : escapeHtml(row.eventId)}</td>
  </tr>`).join("");
}

function main() {
  requireFile(EVENTS_CSV);
  requireFile(SUMMARY_JSON);
  requireFile(X_SUMMARY_CSV);
  mkdirSync(OUT_DIR, { recursive: true });

  const events = parseCsv(readFileSync(EVENTS_CSV, "utf8")) as unknown as CardEventRow[];
  const summary = JSON.parse(readFileSync(SUMMARY_JSON, "utf8")) as Summary;
  const xSummary = parseCsv(readFileSync(X_SUMMARY_CSV, "utf8"))[0] || {};
  const xPosts = existsSync(X_POSTS_CSV) ? parseCsv(readFileSync(X_POSTS_CSV, "utf8")) as unknown as XSharePostRow[] : [];
  const duplicateRows = Object.entries(summary.duplicateRecipients)
    .sort((a, b) => b[1] - a[1])
    .map(([recipient, count]) => `<tr><td>@${escapeHtml(recipient)}</td><td>${count}</td><td>historical duplicate burst</td></tr>`)
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open Design Contributor Card Dashboard</title>
  <style>
    body { margin:0; background:#0f172a; color:#f8fafc; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width:min(1180px, calc(100vw - 48px)); margin:0 auto; padding:48px 0 72px; }
    h1 { font-size: clamp(36px, 6vw, 72px); line-height:.95; letter-spacing:-.06em; margin:0 0 10px; }
    h2 { margin:0 0 18px; }
    p, small, .muted { color:#94a3b8; line-height:1.65; }
    .stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:16px; margin:24px 0; }
    .stat, .panel { border:1px solid rgba(148,163,184,.24); border-radius:24px; background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)); box-shadow:0 24px 80px rgba(2,6,23,.38); }
    .stat { min-height:140px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; }
    .stat span { color:#94a3b8; }
    .stat strong { font-size:42px; letter-spacing:-.04em; }
    .panel { padding:24px; margin-top:18px; overflow:auto; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .bar { display:grid; grid-template-columns:150px 1fr 48px; gap:12px; align-items:center; margin:12px 0; }
    .bar i { height:12px; background:rgba(148,163,184,.16); border-radius:99px; overflow:hidden; }
    .bar b { display:block; height:100%; background:linear-gradient(90deg, #22d3ee, #fbbf24); border-radius:99px; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:11px 10px; border-bottom:1px solid rgba(148,163,184,.24); text-align:left; font-size:14px; }
    th { color:#94a3b8; }
    a { color:#22d3ee; text-decoration:none; }
    @media (max-width:900px) { .stats, .grid { grid-template-columns:1fr; } main { width:min(100vw - 28px, 720px); } }
  </style>
</head>
<body>
<main>
  <p class="muted">Open Design Contributor Recognition · Open Design 贡献者认可</p>
  <h1>Card Funnel Dashboard<br>卡片漏斗看板</h1>
  <p class="muted">Generated 生成时间: ${escapeHtml(summary.generatedAt)}</p>

  <section class="stats">
    ${stat("Deduped Cards Posted", summary.dedupedCardEvents, "business reporting count", "用于汇报的去重口径")}
    ${stat("Raw Cards Posted", summary.rawCardComments, "visible bot comments", "真实可见 bot 评论数")}
    ${stat("Unique Recipients", summary.uniqueRecipients, "contributors who received a card", "收到卡片的去重贡献者")}
    ${stat("Historical Duplicates", summary.historicalDuplicateCount, "duplicate burst events excluded from headline metrics", "已从核心指标排除的历史重复卡")}
  </section>

  <section class="panel">
    <h2>Historical Duplicate Bursts 历史重复发卡</h2>
    <p class="muted">These rows came from the old workflow race condition. They remain visible on GitHub for audit, but are excluded from deduped headline metrics.<br>这些记录来自旧 workflow 并发问题。GitHub 上仍可见用于审计，但不会进入去重后的核心汇报指标。</p>
    <table><thead><tr><th>Recipient</th><th>Duplicate cards</th><th>Reason</th></tr></thead><tbody>${duplicateRows || `<tr><td colspan="3">No duplicate burst detected.</td></tr>`}</tbody></table>
  </section>

  <section class="grid">
    <div class="panel"><h2>Cards By Tier 按段位分布</h2>${countRows(summary.byTier)}</div>
    <div class="panel"><h2>Trigger Surface 触发场景</h2>${countRows(summary.bySurface)}</div>
  </section>

  <section class="panel">
    <h2>X Sharing And Redirect Tracking X 分享与回流追踪</h2>
    <div class="stats">
      ${stat("X Posts Found", xSummary.x_posts_found || 0, `X API: ${xSummary.x_api_status || "not_configured"}`, "检测到的推文")}
      ${stat("Impressions", xSummary.x_impressions_total || 0, "from X API or CSV", "曝光数")}
      ${stat("Engagements", xSummary.x_engagements_total || 0, "likes + reposts + replies + bookmarks", "互动数")}
      ${stat("GitHub Clicks", xSummary.x_clicks_to_github || 0, xSummary.x_to_github_conversion || "unavailable", "回流 GitHub 点击")}
    </div>
    <p class="muted">Share URLs use <code>https://open-design.ai/share/:eventId</code>, which redirects to GitHub with UTM params. X API enrichment is optional and dashboard generation does not fail when the token is missing.<br>分享链接使用 <code>https://open-design.ai/share/:eventId</code> 中转并带 UTM 跳转到 GitHub。X API 是可选增强，没有 token 时看板仍可生成。</p>
    <h3>Public X Shares 公开 X 分享</h3>
    <table><thead><tr><th>Posted</th><th>X Author</th><th>Card Recipient</th><th>Tier</th><th>Likes</th><th>Reposts</th><th>Replies</th><th>Event</th></tr></thead><tbody>${xShareRows(xPosts)}</tbody></table>
  </section>

  <section class="panel">
    <h2>Recent Card Comments 最近的卡片评论</h2>
    <table><thead><tr><th>Time</th><th>Recipient</th><th>Tier</th><th>Surface</th><th>Dedupe</th><th>Thread</th></tr></thead><tbody>${recentRows(events)}</tbody></table>
  </section>
</main>
</body>
</html>`;

  writeFileSync(OUTPUT_INDEX_HTML, html);
  writeFileSync(OUTPUT_HTML, html);
  console.log(`Wrote ${OUTPUT_INDEX_HTML}`);
  console.log(`Wrote ${OUTPUT_HTML}`);
}

main();
