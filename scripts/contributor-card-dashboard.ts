import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "preview";
const EVENTS_CSV = join(OUT_DIR, "contributor-card-events.csv");
const SUMMARY_JSON = join(OUT_DIR, "contributor-card-summary.json");
const SHARE_ANALYTICS_JSON = join(OUT_DIR, "share-analytics.json");
const OUTPUT_INDEX_HTML = join(OUT_DIR, "index.html");
const OUTPUT_HTML = join(OUT_DIR, "contributor-card-dashboard.html");

const PAGES_ANALYTICS_URL =
  "https://dash.cloudflare.com/64ad4569ffd912432d6b86d5656484c4/pages/view/open-design-landing/analytics";
const SHARE_ANALYTICS_JSON_PUBLIC_URL =
  "https://preview-zeta-opal.vercel.app/share-analytics.json";
const SHARE_ANALYTICS_CSV_PUBLIC_URL =
  "https://preview-zeta-opal.vercel.app/share-analytics.csv";

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

type ShareAnalyticsDaily = { date: string; clicks: number; errors: number };

type ShareAnalytics = {
  generatedAt: string;
  source: string;
  functionLiveFrom: string;
  windows: {
    last30Days: {
      totalClicks: number;
      totalErrors: number;
      daily: ShareAnalyticsDaily[];
    };
  };
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

function loadShareAnalytics(): ShareAnalytics | null {
  if (!existsSync(SHARE_ANALYTICS_JSON)) return null;
  try {
    return JSON.parse(readFileSync(SHARE_ANALYTICS_JSON, "utf8")) as ShareAnalytics;
  } catch {
    return null;
  }
}

function renderSparkline(daily: ShareAnalyticsDaily[]): string {
  if (!daily.length) return "";
  const width = 720;
  const height = 200;
  const padding = { top: 24, right: 24, bottom: 36, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...daily.map((d) => d.clicks));
  type Plot = { date: string; clicks: number; x: number; y: number };
  const plots: Plot[] = daily.map((d, i) => {
    const x = padding.left + (daily.length === 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW);
    const y = padding.top + innerH - (d.clicks / max) * innerH;
    return { date: d.date, clicks: d.clicks, x, y };
  });
  const first = plots[0]!;
  const last = plots[plots.length - 1]!;
  const baseline = padding.top + innerH;
  const points = plots.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M ${first.x.toFixed(1)},${baseline.toFixed(1)} L ${points.split(" ").join(" L ")} L ${last.x.toFixed(1)},${baseline.toFixed(1)} Z`;
  const yTicks = [0, Math.round(max / 2), max];
  const gridLines = yTicks
    .map((tick) => {
      const y = padding.top + innerH - (tick / max) * innerH;
      return `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}" stroke="rgba(148,163,184,.18)" stroke-dasharray="3 5" />`
        + `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${tick}</text>`;
    })
    .join("");
  const labelStride = Math.max(1, Math.ceil(plots.length / 8));
  const xLabels = plots
    .map((p, i) => {
      if (plots.length > 10 && i % labelStride !== 0 && i !== plots.length - 1) return "";
      return `<text x="${p.x.toFixed(1)}" y="${height - 12}" text-anchor="middle" fill="#94a3b8" font-size="11">${p.date.slice(5)}</text>`;
    })
    .join("");
  const dots = plots
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#fbbf24"><title>${p.date}: ${p.clicks} click(s)</title></circle>`)
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Daily share clicks">
    <defs>
      <linearGradient id="sparkArea" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${area}" fill="url(#sparkArea)" />
    <polyline points="${points}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}
    ${xLabels}
  </svg>`;
}

function renderShareAnalyticsPanel(
  analytics: ShareAnalytics | null,
  cardsWithShareLink: number,
): string {
  if (!analytics) {
    return `<section class="panel">
      <h2>X Share Tracking X 分享追踪</h2>
      <p class="muted">Share analytics not generated yet. Run <code>pnpm run report:share-analytics</code> with <code>CLOUDFLARE_API_TOKEN</code> set.<br>分享数据尚未生成，需要本地导出或等下一次定时任务跑完。</p>
      <div class="stats">
        ${stat("Cards With /share Link", cardsWithShareLink, "cards posted with /share redirect link", "已带 /share 回流链接的卡片数")}
        ${stat("Pages Analytics", "Open in Cloudflare", "manual fallback", "手动后台兜底")}
        ${stat("Public JSON", "Not generated", "needs CF token", "缺 CF token")}
        ${stat("Public CSV", "Not generated", "needs CF token", "缺 CF token")}
      </div>
      <p><a class="cta" href="${PAGES_ANALYTICS_URL}" target="_blank" rel="noreferrer">Open Cloudflare Pages Analytics &rarr;</a></p>
    </section>`;
  }
  const win = analytics.windows.last30Days;
  const daily = win.daily;
  const activeDays = daily.filter((d) => d.clicks > 0).length;
  const peak = daily.reduce<ShareAnalyticsDaily | null>(
    (acc, d) => (acc && acc.clicks >= d.clicks ? acc : d),
    null,
  );
  const tableRows = [...daily]
    .reverse()
    .map((d) => `<tr><td>${escapeHtml(d.date)}</td><td style="text-align:right">${d.clicks}</td><td style="text-align:right">${d.errors}</td></tr>`)
    .join("");
  return `<section class="panel">
    <h2>X Share Tracking X 分享追踪</h2>
    <p class="muted">Per-day Cloudflare Pages Function invocations on <code>open-design.ai</code>. Covers <code>/share/:eventId</code> (return clicks from X) and <code>/share-out/:eventId</code> (clicks on the Share-on-X button inside GitHub). Function live from <strong>${escapeHtml(analytics.functionLiveFrom)}</strong>, earlier dates are structural zeros.<br>每天 <code>open-design.ai</code> 上 Cloudflare Pages Function 的调用数，覆盖回流点击与 GitHub 评论按钮点击；上线于 <strong>${escapeHtml(analytics.functionLiveFrom)}</strong>，之前是结构性 0。</p>
    <div class="stats">
      ${stat("Clicks Last 30d", win.totalClicks, `${activeDays} active day(s) since ${analytics.functionLiveFrom}`, `自上线后有 ${activeDays} 天有点击`)}
      ${stat("Peak Day", peak ? `${peak.clicks}` : "0", peak ? `on ${peak.date}` : "no data", peak ? `日期 ${peak.date}` : "暂无")}
      ${stat("Errors Last 30d", win.totalErrors, "non-success function invocations", "非 success 调用数")}
      ${stat("Cards With /share Link", cardsWithShareLink, "cards posted with /share redirect link", "已带 /share 回流链接的卡片数")}
    </div>
    <div style="margin-top:18px;">${renderSparkline(daily)}</div>
    <h3 style="margin-top:24px;">Daily Breakdown 按日明细</h3>
    <table><thead><tr><th>Date</th><th style="text-align:right">Clicks</th><th style="text-align:right">Errors</th></tr></thead><tbody>${tableRows}</tbody></table>
    <h3 style="margin-top:24px;">Public Endpoints (for downstream dashboards) 给下游看版用的公开 URL</h3>
    <ul class="muted" style="line-height:1.9;">
      <li><a href="${SHARE_ANALYTICS_JSON_PUBLIC_URL}" target="_blank" rel="noreferrer"><code>${SHARE_ANALYTICS_JSON_PUBLIC_URL}</code></a> &mdash; machine-readable JSON · 机器读</li>
      <li><a href="${SHARE_ANALYTICS_CSV_PUBLIC_URL}" target="_blank" rel="noreferrer"><code>${SHARE_ANALYTICS_CSV_PUBLIC_URL}</code></a> &mdash; <code>=IMPORTDATA(...)</code> in Google Sheets · Sheets 一行公式接入</li>
      <li>Refreshed hourly by <code>contributor-dashboard.yml</code> · 由 <code>contributor-dashboard.yml</code> 每小时刷新</li>
    </ul>
    <p><a class="cta" href="${PAGES_ANALYTICS_URL}" target="_blank" rel="noreferrer">Open Cloudflare Pages Analytics &rarr;</a></p>
  </section>`;
}

function main() {
  requireFile(EVENTS_CSV);
  requireFile(SUMMARY_JSON);
  mkdirSync(OUT_DIR, { recursive: true });

  const events = parseCsv(readFileSync(EVENTS_CSV, "utf8")) as unknown as CardEventRow[];
  const summary = JSON.parse(readFileSync(SUMMARY_JSON, "utf8")) as Summary;
  const shareAnalytics = loadShareAnalytics();
  const duplicateRows = Object.entries(summary.duplicateRecipients)
    .sort((a, b) => b[1] - a[1])
    .map(([recipient, count]) => `<tr><td>@${escapeHtml(recipient)}</td><td>${count}</td><td>historical duplicate burst</td></tr>`)
    .join("");

  const cardsWithShareLink = events.filter((event) => event.shareUrl).length;
  const shareAnalyticsPanel = renderShareAnalyticsPanel(shareAnalytics, cardsWithShareLink);

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

  ${shareAnalyticsPanel}

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
