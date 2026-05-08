/**
 * GitHub Actions entry: read the workflow event payload, render the right
 * tier card, commit the PNG to the bot-cards branch, and post a comment.
 *
 * Triggered by .github/workflows/contributor-bot.yml on:
 *   - pull_request.closed (merged=true)  → Signal upgrade card
 *   - issues.opened                      → Spark welcome card
 *
 * Required env vars (provided by workflow):
 *   GH_APP_ID                  GitHub App ID (3640364)
 *   GH_APP_INSTALLATION_ID     Installation ID (130472709)
 *   GH_APP_PRIVATE_KEY         Full PEM contents of the App's private key
 *   GITHUB_REPOSITORY          owner/repo (provided by GH Actions)
 *   GITHUB_EVENT_NAME          pull_request | issues
 *   GITHUB_EVENT_PATH          path to event JSON
 */
import { readFileSync } from "node:fs";
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

const FONT_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf";
const FONT_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf";
const CJK_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf";
const CJK_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-900-normal.ttf";

const CARDS_BRANCH = "bot-cards";

interface RenderArgs {
  owner: string;
  repo: string;
  threadNumber: number;
  author: { login: string; avatar_url: string };
  tierKey: TierKey;
  scenario: "tier-up" | "welcome-spark";
}

async function renderAndPost(octokit: ReturnType<typeof App.prototype.getInstallationOctokit> extends Promise<infer T> ? T : never, args: RenderArgs) {
  const { owner, repo, threadNumber, author, tierKey, scenario } = args;
  const tier = tierByKey(tierKey);

  const cardProps: CardProps = {
    username: author.login,
    avatarUrl: author.avatar_url,
    rank: 1,
    totalContributors: 1,
    topPercent: 100,
    points: scenario === "welcome-spark" ? 0 : tier.threshold,
    streakWeeks: 0,
    prsMerged: scenario === "tier-up" ? 1 : 0,
    reviews: 0,
    discussionsAnswered: 0,
    issuesAccepted: scenario === "welcome-spark" ? 1 : 0,
  };

  console.log(`🎨 Rendering ${tier.emoji} ${tier.nameEn} card for @${author.login}...`);
  const [f400, f900, cjk400, cjk900] = await Promise.all([
    fetch(FONT_400_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_900_URL).then((r) => r.arrayBuffer()),
    fetch(CJK_400_URL).then((r) => r.arrayBuffer()),
    fetch(CJK_900_URL).then((r) => r.arrayBuffer()),
  ]);
  const Component = REGISTRY[tierKey];
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
  const pngBase64 = Buffer.from(png).toString("base64");

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const pngPath = `data/cards/${author.login}-${tierKey}-${ts}.png`;

  console.log(`🌿 Ensuring branch '${CARDS_BRANCH}' exists ...`);
  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${CARDS_BRANCH}` });
    console.log(`   already exists`);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
      const main = await octokit.rest.git.getRef({ owner, repo, ref: "heads/main" });
      await octokit.rest.git.createRef({
        owner, repo,
        ref: `refs/heads/${CARDS_BRANCH}`,
        sha: main.data.object.sha,
      });
      console.log(`   created from main`);
    } else { throw err; }
  }

  console.log(`📤 Committing PNG to ${owner}/${repo}:${pngPath} on ${CARDS_BRANCH} ...`);
  const commit = await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo, path: pngPath,
    message: `feat(card): ${tier.nameEn} card for @${author.login}`,
    content: pngBase64,
    branch: CARDS_BRANCH,
  });
  const pngUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${CARDS_BRANCH}/${pngPath}`;
  console.log(`   ✅ committed: ${commit.data.commit.html_url}`);

  const body = scenario === "welcome-spark"
    ? welcomeSparkComment(cardProps, pngUrl)
    : tierUpComment(cardProps, pngUrl);

  console.log(`💬 Posting comment on #${threadNumber} ...`);
  const comment = await octokit.rest.issues.createComment({
    owner, repo, issue_number: threadNumber, body,
  });
  console.log(`   ✅ posted: ${comment.data.html_url}`);
}

async function main() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!eventName || !eventPath || !repository) {
    console.error("❌ Missing GH Actions env vars");
    process.exit(1);
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error(`❌ Invalid GITHUB_REPOSITORY: ${repository}`);
    process.exit(1);
  }

  const event = JSON.parse(readFileSync(eventPath, "utf8"));

  const appId = process.env.BOT_APP_ID || process.env.GH_APP_ID;
  const installationId = process.env.BOT_APP_INSTALLATION_ID || process.env.GH_APP_INSTALLATION_ID;
  const privateKey = process.env.BOT_APP_PRIVATE_KEY || process.env.GH_APP_PRIVATE_KEY;

  if (!appId || !installationId || !privateKey) {
    console.error("❌ Missing App credentials (BOT_APP_ID / BOT_APP_INSTALLATION_ID / BOT_APP_PRIVATE_KEY)");
    process.exit(1);
  }

  const app = new App({ appId, privateKey });
  const octokit = await app.getInstallationOctokit(Number(installationId));

  console.log(`📥 Event: ${eventName}.${event.action}`);

  if (eventName === "pull_request" && event.action === "closed" && event.pull_request?.merged) {
    const author = event.pull_request.user;
    if (!author || author.login.endsWith("[bot]")) {
      console.log("   skipping: bot author");
      return;
    }
    await renderAndPost(octokit, {
      owner, repo,
      threadNumber: event.pull_request.number,
      author: { login: author.login, avatar_url: author.avatar_url },
      tierKey: "signal",
      scenario: "tier-up",
    });
  } else if (eventName === "issues" && event.action === "opened") {
    const author = event.issue.user;
    if (!author || author.login.endsWith("[bot]")) {
      console.log("   skipping: bot author");
      return;
    }
    await renderAndPost(octokit, {
      owner, repo,
      threadNumber: event.issue.number,
      author: { login: author.login, avatar_url: author.avatar_url },
      tierKey: "spark",
      scenario: "welcome-spark",
    });
  } else {
    console.log(`   skipping: ${eventName}.${event.action} not handled`);
  }
}

main().catch((err) => {
  console.error("❌ action-handler failed:");
  console.error(err);
  process.exit(1);
});
