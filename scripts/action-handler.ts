/**
 * GitHub Actions entry: read the workflow event payload, render the right
 * tier card, commit the PNG to the bot-cards branch, and post a comment.
 *
 * Triggered by .github/workflows/contributor-bot.yml on contribution events.
 * It only posts cards on first-touch Spark or tier crossings.
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
import { join } from "node:path";
import { App } from "octokit";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import type { CardProps, TierKey } from "../src/cards/types.ts";
import { CertificateCard } from "../src/cards/CertificateCard.tsx";
import { tierByKey, tierFromPoints } from "../src/tier.ts";
import { tierUpComment, welcomeSparkComment } from "../src/comment.ts";
import { fetchVauntContributorScore } from "../src/vaunt.ts";

const FONT_INTER_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf";
const FONT_INTER_700_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf";
const FONT_BEBAS_URL = "https://cdn.jsdelivr.net/fontsource/fonts/bebas-neue@latest/latin-400-normal.ttf";
const FONT_PLAYFAIR_URL = "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf";
const CERTIFICATE_BASE_PATH = "assets/certificate-base.png";

const CARDS_BRANCH = "bot-cards";
const STATE_PATH = "data/contributor-card-state.json";

type BotOctokit = ReturnType<typeof App.prototype.getInstallationOctokit> extends Promise<infer T> ? T : never;

const TIER_ORDER: Record<TierKey, number> = {
  spark: 0,
  signal: 1,
  node: 2,
  beacon: 3,
  nova: 4,
};

interface ContributorStats {
  prsMerged: number;
  reviews: number;
  issuesOpened: number;
  commentedThreads: number;
}

interface ContributorCardState {
  generatedAt: string;
  contributors: Record<string, ContributorStateEntry>;
}

interface ContributorStateEntry {
  lastAnnouncedTier: TierKey;
  lastKnownScore: number;
  lastCheckedAt: string;
  lastAnnouncedAt?: string;
}

interface EventContext {
  actor: { login: string; avatar_url: string };
  threadNumber?: number;
  eventDelta: number;
  canComment: boolean;
  reason: string;
}

interface RenderArgs {
  owner: string;
  repo: string;
  threadNumber: number;
  author: { login: string; avatar_url: string };
  tierKey: TierKey;
  scenario: "tier-up" | "welcome-spark";
  points: number;
  rank: number;
  totalContributors: number;
}

async function renderAndPost(octokit: BotOctokit, args: RenderArgs, stats: ContributorStats) {
  const { owner, repo, threadNumber, author, tierKey, scenario, points, rank, totalContributors } = args;
  const tier = tierByKey(tierKey);

  const cardProps: CardProps = {
    username: author.login,
    avatarUrl: author.avatar_url,
    rank,
    totalContributors,
    topPercent: totalContributors > 0 ? (rank / totalContributors) * 100 : 100,
    points,
    streakWeeks: 0,
    prsMerged: stats.prsMerged,
    reviews: stats.reviews,
    discussionsAnswered: 0,
    issuesAccepted: stats.issuesOpened,
  };

  console.log(`🎨 Rendering ${tier.emoji} ${tier.nameEn} card for @${author.login}...`);
  const [inter400, inter700, bebas, playfair] = await Promise.all([
    fetch(FONT_INTER_400_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_INTER_700_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_BEBAS_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_PLAYFAIR_URL).then((r) => r.arrayBuffer()),
  ]);
  const baseBytes = readFileSync(join(process.cwd(), CERTIFICATE_BASE_PATH));
  const baseImageDataUrl = `data:image/png;base64,${baseBytes.toString("base64")}`;
  const node = CertificateCard({
    ...cardProps,
    baseImageDataUrl,
    tierNameEn: tier.nameEn,
  });
  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: 941,
    height: 1672,
    fonts: [
      { name: "Inter", data: inter400, weight: 400, style: "normal" },
      { name: "Inter", data: inter700, weight: 700, style: "normal" },
      { name: "Bebas", data: bebas, weight: 400, style: "normal" },
      { name: "Playfair", data: playfair, weight: 400, style: "normal" },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  const pngBase64 = Buffer.from(png).toString("base64");

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const pngPath = `data/cards/${author.login}-${tierKey}-${ts}.png`;

  await ensureCardsBranch(octokit, owner, repo);

  console.log(`🌿 Using branch '${CARDS_BRANCH}' ...`);
  console.log(`   ready`);
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

async function ensureCardsBranch(octokit: BotOctokit, owner: string, repo: string) {
  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${CARDS_BRANCH}` });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
      const main = await octokit.rest.git.getRef({ owner, repo, ref: "heads/main" });
      await octokit.rest.git.createRef({
        owner, repo,
        ref: `refs/heads/${CARDS_BRANCH}`,
        sha: main.data.object.sha,
      });
    } else { throw err; }
  }
}

async function searchCount(octokit: BotOctokit, q: string): Promise<number> {
  const res = await octokit.rest.search.issuesAndPullRequests({ q, per_page: 1 });
  return res.data.total_count;
}

async function fetchContributorStats(
  octokit: BotOctokit,
  owner: string,
  repo: string,
  login: string,
): Promise<ContributorStats> {
  const base = `repo:${owner}/${repo}`;
  const [prsMerged, reviews, issuesOpened, commentedThreads] = await Promise.all([
    searchCount(octokit, `${base} is:pr is:merged author:${login}`),
    searchCount(octokit, `${base} is:pr reviewed-by:${login}`),
    searchCount(octokit, `${base} is:issue author:${login}`),
    searchCount(octokit, `${base} commenter:${login}`),
  ]);

  return { prsMerged, reviews, issuesOpened, commentedThreads };
}

function defaultState(): ContributorCardState {
  return { generatedAt: new Date().toISOString(), contributors: {} };
}

async function readState(
  octokit: BotOctokit,
  owner: string,
  repo: string,
): Promise<{ state: ContributorCardState; sha?: string }> {
  await ensureCardsBranch(octokit, owner, repo);

  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: STATE_PATH,
      ref: CARDS_BRANCH,
    });
    if (Array.isArray(res.data) || res.data.type !== "file" || !("content" in res.data)) {
      return { state: defaultState() };
    }

    const json = Buffer.from(res.data.content, "base64").toString("utf8");
    return { state: JSON.parse(json) as ContributorCardState, sha: res.data.sha };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
      return { state: defaultState() };
    }
    throw err;
  }
}

async function writeState(
  octokit: BotOctokit,
  owner: string,
  repo: string,
  state: ContributorCardState,
  sha?: string,
) {
  state.generatedAt = new Date().toISOString();
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: STATE_PATH,
    message: "chore(contributor-bot): update card state",
    content: Buffer.from(`${JSON.stringify(state, null, 2)}\n`).toString("base64"),
    branch: CARDS_BRANCH,
    ...(sha ? { sha } : {}),
  });
}

function extractContext(eventName: string, event: any): EventContext | null {
  if (eventName === "pull_request_target" && event.action === "closed" && event.pull_request?.merged) {
    return {
      actor: event.pull_request.user,
      threadNumber: event.pull_request.number,
      eventDelta: 1,
      canComment: true,
      reason: "merged PR",
    };
  }

  if (eventName === "issues" && event.action === "opened") {
    return {
      actor: event.issue.user,
      threadNumber: event.issue.number,
      eventDelta: 1,
      canComment: true,
      reason: "opened issue",
    };
  }

  if (eventName === "pull_request_review" && event.action === "submitted") {
    return {
      actor: event.review.user,
      threadNumber: event.pull_request.number,
      eventDelta: 1,
      canComment: true,
      reason: "submitted PR review",
    };
  }

  if (eventName === "issue_comment" && event.action === "created") {
    return {
      actor: event.comment.user,
      threadNumber: event.issue.number,
      eventDelta: 1,
      canComment: true,
      reason: "created issue/PR comment",
    };
  }

  if (eventName === "pull_request_review_comment" && event.action === "created") {
    return {
      actor: event.comment.user,
      threadNumber: event.pull_request.number,
      eventDelta: 1,
      canComment: true,
      reason: "created PR review comment",
    };
  }

  if (eventName === "discussion" && event.action === "created") {
    return {
      actor: event.discussion.user,
      eventDelta: 1,
      canComment: false,
      reason: "created discussion",
    };
  }

  if (eventName === "discussion_comment" && event.action === "created") {
    return {
      actor: event.comment.user,
      eventDelta: 1,
      canComment: false,
      reason: "created discussion comment",
    };
  }

  return null;
}

function shouldAnnounce(args: {
  currentTier: TierKey;
  existing?: ContributorStateEntry;
}): { announce: boolean; scenario: "tier-up" | "welcome-spark"; tierKey: TierKey } {
  const { currentTier, existing } = args;
  if (existing) {
    return {
      announce: TIER_ORDER[currentTier] > TIER_ORDER[existing.lastAnnouncedTier],
      scenario: currentTier === "spark" ? "welcome-spark" : "tier-up",
      tierKey: currentTier,
    };
  }

  // No state means the contributor has not received any recognition card yet.
  // Announce their current tier once, then future events only announce upgrades.
  return {
    announce: true,
    scenario: currentTier === "spark" ? "welcome-spark" : "tier-up",
    tierKey: currentTier,
  };
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

  console.log(`📥 Event: ${eventName}.${event.action ?? "manual"}`);
  const context = extractContext(eventName, event);
  if (!context) {
    console.log(`   skipping: ${eventName}.${event.action ?? "manual"} not handled`);
    return;
  }

  const author = context.actor;
  if (!author || author.login.endsWith("[bot]")) {
    console.log("   skipping: bot author");
    return;
  }

  const [vauntScore, stats, stateResult] = await Promise.all([
    fetchVauntContributorScore(owner, repo, author.login),
    fetchContributorStats(octokit, owner, repo, author.login),
    readState(octokit, owner, repo),
  ]);

  const currentScore = (vauntScore?.score ?? 0) + context.eventDelta;
  const currentTier = tierFromPoints(currentScore);
  const rank = vauntScore?.rank ?? 1;
  const totalContributors = vauntScore?.totalFetched ?? Math.max(1, rank);
  const stateKey = author.login.toLowerCase();
  const existing = stateResult.state.contributors[stateKey];
  const decision = shouldAnnounce({
    currentTier: currentTier.key,
    existing,
  });

  console.log(
    `   @${author.login}: ${currentScore} contributions, ${currentTier.nameEn}, ${context.reason}, announce=${decision.announce}`,
  );

  const threadNumber = context.threadNumber;
  const didPostCard = decision.announce && context.canComment && threadNumber !== undefined;

  if (didPostCard) {
    await renderAndPost(octokit, {
      owner, repo,
      threadNumber,
      author: { login: author.login, avatar_url: author.avatar_url },
      tierKey: decision.tierKey,
      scenario: decision.scenario,
      points: currentScore,
      rank,
      totalContributors,
    }, stats);
  } else if (decision.announce && !context.canComment) {
    console.log("   tier crossed, but this event has no supported GitHub comment surface yet");
  } else {
    console.log("   no tier crossing; no card posted");
  }

  const now = new Date().toISOString();
  stateResult.state.contributors[stateKey] = {
    lastAnnouncedTier: didPostCard ? decision.tierKey : existing?.lastAnnouncedTier ?? "spark",
    lastKnownScore: currentScore,
    lastCheckedAt: now,
    ...(didPostCard ? { lastAnnouncedAt: now } : existing?.lastAnnouncedAt ? { lastAnnouncedAt: existing.lastAnnouncedAt } : {}),
  };
  await writeState(octokit, owner, repo, stateResult.state, stateResult.sha);
}

main().catch((err) => {
  console.error("❌ action-handler failed:");
  console.error(err);
  process.exit(1);
});
