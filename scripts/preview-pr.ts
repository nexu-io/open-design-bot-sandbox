/**
 * Dry-run preview: pick a real PR from nexu-io/open-design,
 * fetch real author + avatar, render the upgrade card we WOULD post,
 * and save both the PNG and the markdown comment locally for review.
 *
 * Does NOT post anything to GitHub. Zero risk.
 *
 * Usage:
 *   pnpm exec tsx scripts/preview-pr.ts                 # latest merged PR, default Signal tier
 *   pnpm exec tsx scripts/preview-pr.ts 500             # specific PR, default Signal tier
 *   pnpm exec tsx scripts/preview-pr.ts 500 nova        # specific PR + specific tier
 *   pnpm exec tsx scripts/preview-pr.ts latest beacon   # latest PR + specific tier
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { App } from "octokit";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import type { CardProps, TierKey } from "../src/cards/types.ts";
import { SparkCard } from "../src/cards/SparkCard.tsx";
import { SignalCard } from "../src/cards/SignalCard.tsx";
import { NodeCard } from "../src/cards/NodeCard.tsx";
import { BeaconCard } from "../src/cards/BeaconCard.tsx";
import { NovaCard } from "../src/cards/NovaCard.tsx";
import { tierByKey } from "../src/tier.ts";
import { tierUpComment } from "../src/comment.ts";

const REGISTRY = {
  spark: SparkCard,
  signal: SignalCard,
  node: NodeCard,
  beacon: BeaconCard,
  nova: NovaCard,
} as const;

interface SimulatedProfile {
  points: number;
  rank: number;
  total: number;
  topPercent: number;
  streak: number;
  prs: number;
  reviews: number;
  discussions: number;
  issues: number;
}

const SAMPLE_PROFILES: Record<TierKey, SimulatedProfile> = {
  spark:  { points: 5,    rank: 2210, total: 3772, topPercent: 60,  streak: 0,  prs: 0,  reviews: 0,   discussions: 0,  issues: 1 },
  signal: { points: 30,   rank: 1050, total: 3772, topPercent: 28,  streak: 1,  prs: 1,  reviews: 0,   discussions: 0,  issues: 0 },
  node:   { points: 200,  rank: 320,  total: 3772, topPercent: 8,   streak: 5,  prs: 5,  reviews: 12,  discussions: 3,  issues: 4 },
  beacon: { points: 750,  rank: 145,  total: 3772, topPercent: 4,   streak: 10, prs: 18, reviews: 45,  discussions: 12, issues: 11 },
  nova:   { points: 2600, rank: 7,    total: 3772, topPercent: 0.5, streak: 18, prs: 47, reviews: 120, discussions: 35, issues: 28 },
};

function loadDevVars(path: string): Record<string, string> {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Copy .dev.vars.example and fill it in.`);
    process.exit(1);
  }
  const out: Record<string, string> = {};
  let buffer = "";
  let currentKey: string | null = null;
  let inMultiline = false;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (inMultiline) {
      if (line.endsWith('"') && !line.endsWith('\\"')) {
        buffer += line.slice(0, -1);
        out[currentKey!] = buffer;
        currentKey = null;
        buffer = "";
        inMultiline = false;
      } else {
        buffer += line + "\n";
      }
      continue;
    }
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"(.*)$/);
    if (!m) continue;
    const [, key, rest] = m as unknown as [string, string, string];
    if (rest.endsWith('"') && !rest.endsWith('\\"')) {
      out[key] = rest.slice(0, -1);
    } else {
      currentKey = key;
      buffer = rest + "\n";
      inMultiline = true;
    }
  }
  return out;
}

const FONT_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf";
const FONT_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf";
const CJK_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf";
const CJK_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-900-normal.ttf";

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  let tierArg: TierKey = "signal";
  let prNumberArg: string | undefined = arg1;

  if (arg1 && (arg1 in REGISTRY)) {
    tierArg = arg1 as TierKey;
    prNumberArg = undefined;
  } else if (arg2 && (arg2 in REGISTRY)) {
    tierArg = arg2 as TierKey;
  } else if (arg2) {
    console.error(`Unknown tier: ${arg2}. Use one of: spark, signal, node, beacon, nova`);
    process.exit(1);
  }

  const vars = loadDevVars(join(process.cwd(), ".dev.vars"));
  const app = new App({ appId: vars.GH_APP_ID!, privateKey: vars.GH_APP_PRIVATE_KEY! });
  const octokit = await app.getInstallationOctokit(Number(vars.GH_APP_INSTALLATION_ID));

  let prNumber: number;
  if (prNumberArg && prNumberArg !== "latest") {
    prNumber = Number(prNumberArg);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      console.error(`Invalid PR number: ${prNumberArg}`);
      process.exit(1);
    }
  } else {
    console.log("\n🔍 Finding latest merged PR in nexu-io/open-design...");
    const list = await octokit.rest.pulls.list({
      owner: "nexu-io",
      repo: "open-design",
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 30,
    });
    const merged = list.data.find((p) => p.merged_at);
    if (!merged) {
      console.error("No merged PR found in last 30 closed PRs.");
      process.exit(1);
    }
    prNumber = merged.number;
    console.log(`   → PR #${prNumber}: "${merged.title}"`);
  }

  console.log(`\n📥 Fetching PR #${prNumber}...`);
  const pr = await octokit.rest.pulls.get({
    owner: "nexu-io",
    repo: "open-design",
    pull_number: prNumber,
  });

  const author = pr.data.user;
  if (!author) {
    console.error(`PR #${prNumber} has no author.`);
    process.exit(1);
  }

  console.log(`   Author:  @${author.login}`);
  console.log(`   Title:   "${pr.data.title}"`);
  console.log(`   Merged:  ${pr.data.merged ? "yes" : "no"}`);
  console.log(`   URL:     ${pr.data.html_url}`);

  const tier = tierByKey(tierArg);
  const profile = SAMPLE_PROFILES[tierArg];
  const cardProps: CardProps = {
    username: author.login,
    avatarUrl: author.avatar_url,
    rank: profile.rank,
    totalContributors: profile.total,
    topPercent: profile.topPercent,
    points: profile.points,
    streakWeeks: profile.streak,
    prsMerged: profile.prs,
    reviews: profile.reviews,
    discussionsAnswered: profile.discussions,
    issuesAccepted: profile.issues,
  };

  console.log(`\n🎨 Rendering ${tier.emoji} ${tier.nameEn} card for @${author.login}...`);

  const [f400, f900, cjk400, cjk900] = await Promise.all([
    fetch(FONT_400_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_900_URL).then((r) => r.arrayBuffer()),
    fetch(CJK_400_URL).then((r) => r.arrayBuffer()),
    fetch(CJK_900_URL).then((r) => r.arrayBuffer()),
  ]);

  const Component = REGISTRY[tierArg];
  const node = (Component as (p: CardProps) => unknown)(cardProps);
  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: 1080,
    height: 1080,
    fonts: [
      { name: "Inter", data: f400, weight: 400, style: "normal" },
      { name: "Inter", data: f900, weight: 900, style: "normal" },
      { name: "Noto Sans SC", data: cjk400, weight: 400, style: "normal" },
      { name: "Noto Sans SC", data: cjk900, weight: 900, style: "normal" },
    ],
  });
  const png = new Resvg(svg).render().asPng();

  mkdirSync("preview", { recursive: true });
  const pngFile = `pr-${prNumber}-${author.login}-${tierArg}.png`;
  const pngPath = `preview/${pngFile}`;
  writeFileSync(pngPath, png);

  const cardUrlPlaceholder = `https://raw.githubusercontent.com/nexu-io/open-design/main/data/cards/${author.login}-${tierArg}-PREVIEW.png`;
  const commentMd = tierUpComment(cardProps, cardUrlPlaceholder);
  const commentRendered = commentMd.replace(cardUrlPlaceholder, pngFile);

  const mdPath = `preview/pr-${prNumber}-${author.login}-${tierArg}.md`;
  const mdContent = [
    `# Dry-run preview · PR #${prNumber} @ ${tier.emoji} ${tier.nameEn}`,
    ``,
    `> This is what the bot WOULD post automatically when @${author.login}'s PR triggered a ${tier.nameEn} tier-up.`,
    `> No actual GitHub comment was posted. The PNG below is the real card the bot rendered.`,
    ``,
    `| | |`,
    `|---|---|`,
    `| **PR** | [#${prNumber}](${pr.data.html_url}) — _${pr.data.title}_ |`,
    `| **Author** | [@${author.login}](https://github.com/${author.login}) |`,
    `| **Tier shown** | ${tier.emoji} ${tier.nameEn} (${tier.nameCn}) |`,
    `| **Card PNG** | \`./${pngFile}\` |`,
    ``,
    `---`,
    ``,
    `## 1. How the comment will look on GitHub`,
    ``,
    commentRendered,
    ``,
    `---`,
    ``,
    `## 2. Raw markdown the bot writes (verbatim)`,
    ``,
    "```markdown",
    commentMd,
    "```",
    ``,
  ].join("\n");
  writeFileSync(mdPath, mdContent);

  console.log(`\n✅ Done!`);
  console.log(`\n   📷 Card image:    ${pngPath}`);
  console.log(`   📝 Comment preview: ${mdPath}\n`);
  console.log(`Open them now:`);
  console.log(`   open ${pngPath}`);
  console.log(`   open ${mdPath}\n`);
}

main().catch((err) => {
  console.error("\n❌ Preview failed:");
  console.error(err);
  process.exit(1);
});
