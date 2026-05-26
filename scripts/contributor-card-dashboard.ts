import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "preview";
const EVENTS_CSV = join(OUT_DIR, "contributor-card-events.csv");
const SUMMARY_JSON = join(OUT_DIR, "contributor-card-summary.json");
const OUTPUT_INDEX_HTML = join(OUT_DIR, "index.html");
const OUTPUT_HTML = join(OUT_DIR, "contributor-card-dashboard.html");

const PAGES_ANALYTICS_URL =
  "https://dash.cloudflare.com/64ad4569ffd912432d6b86d5656484c4/pages/view/open-design-landing/analytics";

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

function main() {
  requireFile(EVENTS_CSV);
  requireFile(SUMMARY_JSON);
  mkdirSync(OUT_DIR, { recursive: true });

  const events = parseCsv(readFileSync(EVENTS_CSV, "utf8")) as unknown as CardEventRow[];
  const summary = JSON.parse(readFileSync(SUMMARY_JSON, "utf8")) as Summary;
  const duplicateRows = Object.entries(summary.duplicateRecipients)
    .sort((a, b) => b[1] - a[1])
    .map(([recipient, count]) => `<tr><td>@${escapeHtml(recipient)}</td><td>${count}</td><td>historical duplicate burst</td></tr>`)
    .join("");

  const cardsWithShareLink = events.filter((event) => event.shareUrl).length;

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
    a.cta { display:inline-block; margin-top:8px; padding:12px 22px; border-radius:14px; background:linear-gradient(90deg, #22d3ee, #fbbf24); color:#0f172a; font-weight:700; letter-spacing:.01em; }
    a.cta:hover { filter:brightness(1.08); }
    ul { margin:6px 0 14px 22px; padding:0; }
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
    <h2>X Share Tracking X 分享追踪</h2>
    <p class="muted">Every contributor card comment ships a <em>Share on X</em> button that goes through <code>https://open-design.ai/share/:eventId</code> and 302-redirects back to GitHub with UTM params. Detailed numbers live in Cloudflare Pages analytics &mdash; no extra setup, no X API.<br>每张卡片评论里的 <em>Share on X</em> 按钮都会先打到 <code>https://open-design.ai/share/:eventId</code>，再带 UTM 参数跳回 GitHub。明细数字直接看 Cloudflare Pages 后台 &mdash; 无需 X API。</p>
    <div class="stats">
      ${stat("Cards with X Share Link", cardsWithShareLink, "cards posted with /share redirect link", "已带 /share 回流链接的卡片数")}
      ${stat("Redirect Endpoint", "/share/:eventId", "live on open-design.ai", "已上线在 open-design.ai")}
      ${stat("Detailed Numbers", "Pages Analytics", "see Cloudflare dashboard", "去 Cloudflare 后台看")}
      ${stat("Per-Event Breakdown", "Disabled", "skipped Cloudflare KV (no permissions)", "未启用 KV 细分，省去权限折腾")}
    </div>
    <h3>What To Check In Pages Analytics 该看哪几项</h3>
    <ul class="muted" style="line-height:1.9;">
      <li><strong>Top referers</strong> &mdash; if you see <code>t.co</code>, <code>x.com</code>, or <code>twitter.com</code>, that&rsquo;s proof a card landed on X. <br>看 Top referers 出现 <code>t.co</code> / <code>x.com</code> / <code>twitter.com</code>，就证明卡片真的被发到 X 了。</li>
      <li><strong>Top paths matching <code>/share/*</code></strong> &mdash; tells you which contributor cards drove the most return clicks.<br>过滤 <code>/share/*</code> 的 Top paths，能看出哪张贡献者卡片带来最多回流点击。</li>
      <li><strong>Requests over time</strong> &mdash; spikes after posting a card == it&rsquo;s circulating.<br>发卡后的请求峰值 == 这张卡正在被传播。</li>
    </ul>
    <p><a class="cta" href="${PAGES_ANALYTICS_URL}" target="_blank" rel="noreferrer">Open Cloudflare Pages Analytics &rarr;</a></p>
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
