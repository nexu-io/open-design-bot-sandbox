/**
 * REAL post-test: render a tier-up card, commit PNG to target repo,
 * and post an actual comment on a real PR.
 *
 * ⚠️  THIS POSTS PUBLICLY VISIBLE CONTENT TO GITHUB. Use a sandbox repo for safety.
 *
 * Usage:
 *   pnpm exec tsx scripts/post-test.ts \
 *     --owner nexu-io \
 *     --repo open-design-bot-sandbox \
 *     --pr 1 \
 *     --tier signal \
 *     --prefix "[INTERNAL TEST] "
 *
 * Args:
 *   --owner   GitHub org/user that owns the target repo (default: nexu-io)
 *   --repo    target repo name (REQUIRED — strongly recommend a private sandbox repo)
 *   --pr      PR number to comment on (REQUIRED)
 *   --tier    tier card to render: spark | signal | node | beacon | nova (default: signal)
 *   --prefix  string prepended to comment header (default: "[INTERNAL TEST] ")
 *   --scenario  tier-up | welcome-spark
 *               tier-up       (default) — bot detects user upgraded to --tier, posts upgrade card
 *               welcome-spark           — first-time public surface, posts Spark welcome card
 *                                         (auto-forces --tier spark and uses welcomeSparkComment)
 *
 * What it does:
 *   1. Loads GitHub App credentials from .dev.vars
 *   2. Fetches the target PR + author info
 *   3. Renders the chosen tier card with the author's real avatar
 *   4. Commits the PNG to data/cards/test-<user>-<tier>-<ts>.png in the target repo (main branch)
 *   5. Posts a PR comment that embeds the PNG via raw.githubusercontent URL
 *   6. Prints both the comment URL and the PNG URL so you can delete them after the test
 */
import { readFileSync, existsSync } from "node:fs";
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
import { tierUpComment, welcomeSparkComment } from "../src/comment.ts";

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
  let buffer = "", currentKey: string | null = null, inMultiline = false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (inMultiline) {
      if (line.endsWith('"') && !line.endsWith('\\"')) {
        buffer += line.slice(0, -1);
        out[currentKey!] = buffer;
        currentKey = null; buffer = ""; inMultiline = false;
      } else { buffer += line + "\n"; }
      continue;
    }
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"(.*)$/);
    if (!m) continue;
    const [, key, rest] = m as unknown as [string, string, string];
    if (rest.endsWith('"') && !rest.endsWith('\\"')) out[key] = rest.slice(0, -1);
    else { currentKey = key; buffer = rest + "\n"; inMultiline = true; }
  }
  return out;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined || !a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { out[key] = true; }
    else { out[key] = next; i++; }
  }
  return out;
}

const FONT_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf";
const FONT_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf";
const CJK_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf";
const CJK_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-900-normal.ttf";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const owner = (args.owner as string) || "nexu-io";
  const repo = args.repo as string;
  const prRaw = args.pr as string;
  const scenario = ((args.scenario as string) || "tier-up") as "tier-up" | "welcome-spark";
  let tierArg = ((args.tier as string) || "signal") as TierKey;
  const prefix = args.prefix === undefined ? "[INTERNAL TEST] " : (args.prefix as string);

  if (scenario === "welcome-spark") {
    tierArg = "spark";
  }
  const useWelcome = args.welcome === true || scenario === "welcome-spark";

  if (!repo) { console.error("❌ --repo is required (use a private sandbox repo!)"); process.exit(1); }
  if (!prRaw) { console.error("❌ --pr is required (issue or PR number — both work)"); process.exit(1); }
  if (!(tierArg in REGISTRY)) { console.error(`❌ --tier must be one of: ${Object.keys(REGISTRY).join(", ")}`); process.exit(1); }
  if (scenario !== "tier-up" && scenario !== "welcome-spark") {
    console.error(`❌ --scenario must be 'tier-up' or 'welcome-spark'`);
    process.exit(1);
  }

  const prNumber = Number(prRaw);
  if (!Number.isInteger(prNumber) || prNumber <= 0) { console.error(`❌ Invalid PR number: ${prRaw}`); process.exit(1); }

  // SAFETY: hard-warn if we're about to post on the public production repo
  if (owner === "nexu-io" && repo === "open-design") {
    console.error("\n🚨 WARNING: You're targeting the PUBLIC production repo nexu-io/open-design.");
    console.error("   This will post a real comment + commit a PNG to main, both visible to all watchers.");
    console.error("   Press Ctrl+C now to abort. Continuing in 5 seconds...\n");
    await new Promise((r) => setTimeout(r, 5000));
  }

  const vars = loadDevVars(join(process.cwd(), ".dev.vars"));
  const app = new App({ appId: vars.GH_APP_ID!, privateKey: vars.GH_APP_PRIVATE_KEY! });
  const octokit = await app.getInstallationOctokit(Number(vars.GH_APP_INSTALLATION_ID));

  console.log(`\n📥 Fetching ${owner}/${repo}#${prNumber} (issue or PR)...`);
  type AuthorInfo = { login: string; avatar_url: string };
  let author: AuthorInfo | null = null;
  let title = "";
  let htmlUrl = "";
  try {
    const pr = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    author = pr.data.user as AuthorInfo | null;
    title = pr.data.title;
    htmlUrl = pr.data.html_url;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
      const issue = await octokit.rest.issues.get({ owner, repo, issue_number: prNumber });
      author = issue.data.user as AuthorInfo | null;
      title = issue.data.title;
      htmlUrl = issue.data.html_url;
    } else { throw err; }
  }
  if (!author) { console.error("Target has no author."); process.exit(1); }
  console.log(`   Author:  @${author.login}`);
  console.log(`   Title:   "${title}"`);
  console.log(`   URL:     ${htmlUrl}`);

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
    width: 1080, height: 1080,
    fonts: [
      { name: "Inter", data: f400, weight: 400, style: "normal" },
      { name: "Inter", data: f900, weight: 900, style: "normal" },
      { name: "Noto Sans SC", data: cjk400, weight: 400, style: "normal" },
      { name: "Noto Sans SC", data: cjk900, weight: 900, style: "normal" },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  const pngBase64 = Buffer.from(png).toString("base64");

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const pngPath = `data/cards/test-${author.login}-${tierArg}-${ts}.png`;
  const cardsBranch = (args["cards-branch"] as string) || "bot-cards";

  console.log(`\n🌿 Ensuring branch '${cardsBranch}' exists ...`);
  let branchSha: string | undefined;
  try {
    const ref = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${cardsBranch}` });
    branchSha = ref.data.object.sha;
    console.log(`   already exists at ${branchSha.slice(0, 7)}`);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
      const main = await octokit.rest.git.getRef({ owner, repo, ref: "heads/main" });
      const created = await octokit.rest.git.createRef({
        owner, repo,
        ref: `refs/heads/${cardsBranch}`,
        sha: main.data.object.sha,
      });
      branchSha = created.data.object.sha;
      console.log(`   created from main at ${branchSha.slice(0, 7)}`);
    } else { throw err; }
  }

  console.log(`\n📤 Committing PNG to ${owner}/${repo}:${pngPath} on ${cardsBranch} ...`);
  const commit = await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo, path: pngPath,
    message: `test: post ${tier.nameEn} card for @${author.login} (PR #${prNumber})`,
    content: pngBase64,
    branch: cardsBranch,
  });
  const pngUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${cardsBranch}/${pngPath}`;
  console.log(`   ✅ committed: ${commit.data.commit.html_url}`);
  console.log(`   raw URL: ${pngUrl}`);

  const baseMd = useWelcome
    ? welcomeSparkComment(cardProps, pngUrl)
    : tierUpComment(cardProps, pngUrl);
  const commentMd = prefix
    ? `<!-- internal test by open-design-bot -->\n**${prefix.trim()}**\n\n${baseMd}`
    : baseMd;

  console.log(`\n💬 Posting comment on PR #${prNumber} ...`);
  const comment = await octokit.rest.issues.createComment({
    owner, repo, issue_number: prNumber,
    body: commentMd,
  });
  console.log(`   ✅ comment posted: ${comment.data.html_url}`);

  console.log(`\n✨ Done!`);
  console.log(`   View comment: ${comment.data.html_url}`);
  console.log(`   View PNG:     ${pngUrl}`);
  console.log(`\nTo clean up afterwards:`);
  console.log(`   - Delete comment: open the URL above and click the "..." menu → Delete`);
  console.log(`   - Delete PNG:     git rm ${pngPath} && git commit -m "test: cleanup" && git push  (in ${owner}/${repo})`);
  console.log(`     (note: file remains in git history)`);
}

main().catch((err) => {
  console.error("\n❌ post-test failed:");
  console.error(err);
  process.exit(1);
});
