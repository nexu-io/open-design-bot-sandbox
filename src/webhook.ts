import type { Octokit } from "@octokit/core";
import type { ContributorRecord, ContributorsFile } from "./storage.ts";
import { readContributors, writeContributors, appendEvent } from "./storage.ts";
import { POINTS, applyMultiplier } from "./scoring.ts";
import { tierFromPoints, tierUp } from "./tier.ts";
import { tierUpComment, noTierUpComment, welcomeSparkComment } from "./comment.ts";
import { renderCardPng, defaultRenderOpts } from "./render.ts";
import type { CardProps } from "./cards/types.ts";

export interface WebhookEnv {
  GH_REPO_OWNER: string;
  GH_REPO_NAME: string;
  DATA_PATH: string;
  EVENTS_PATH: string;
}

interface UserRef {
  login: string;
  avatar_url: string;
}

function ensureUser(file: ContributorsFile, user: UserRef): { rec: ContributorRecord; created: boolean } {
  let rec = file.contributors[user.login];
  if (!rec) {
    rec = {
      username: user.login,
      avatarUrl: user.avatar_url,
      points: 0,
      tier: "spark",
      prsMerged: 0,
      reviews: 0,
      discussionsAnswered: 0,
      issuesAccepted: 0,
      streakWeeks: 0,
      lastActiveAt: new Date().toISOString(),
      founding: false,
      tierHistory: [{ tier: "spark", reachedAt: new Date().toISOString() }],
    };
    file.contributors[user.login] = rec;
    file.totalContributors = Object.keys(file.contributors).length;
    return { rec, created: true };
  }
  rec.avatarUrl = user.avatar_url;
  return { rec, created: false };
}

function hasHadPublicSurface(rec: ContributorRecord): boolean {
  return rec.prsMerged > 0 || rec.issuesAccepted > 0 || rec.discussionsAnswered > 0 || rec.reviews > 0;
}

function rankOf(file: ContributorsFile, username: string): { rank: number; topPercent: number } {
  const sorted = Object.values(file.contributors).sort((a, b) => b.points - a.points);
  const idx = sorted.findIndex((r) => r.username === username);
  const rank = idx + 1;
  const topPercent = (rank / Math.max(1, sorted.length)) * 100;
  return { rank, topPercent };
}

function buildCardProps(rec: ContributorRecord, file: ContributorsFile): CardProps {
  const { rank, topPercent } = rankOf(file, rec.username);
  return {
    username: rec.username,
    avatarUrl: rec.avatarUrl,
    rank,
    totalContributors: file.totalContributors,
    topPercent,
    points: rec.points,
    streakWeeks: rec.streakWeeks,
    prsMerged: rec.prsMerged,
    reviews: rec.reviews,
    discussionsAnswered: rec.discussionsAnswered,
    issuesAccepted: rec.issuesAccepted,
  };
}

interface PRMergedPayload {
  action: "closed";
  pull_request: {
    number: number;
    merged: boolean;
    user: UserRef;
    requested_reviewers?: UserRef[];
  };
  repository: { name: string; owner: { login: string } };
}

export async function handlePullRequestClosed(
  octokit: Octokit,
  env: WebhookEnv,
  payload: PRMergedPayload,
): Promise<void> {
  if (!payload.pull_request.merged) return;
  if (payload.pull_request.user.login.endsWith("[bot]")) return;

  const { data: file, sha } = await readContributors(
    octokit,
    env.GH_REPO_OWNER,
    env.GH_REPO_NAME,
    env.DATA_PATH,
  );

  const { rec } = ensureUser(file, payload.pull_request.user);
  const previousPoints = rec.points;
  const isFirstPr = rec.prsMerged === 0;

  const raw = POINTS.pr_merged + (isFirstPr ? POINTS.pr_merged_first_time_bonus : 0);
  const delta = applyMultiplier(raw, rec.streakWeeks);

  rec.points += delta;
  rec.prsMerged += 1;
  rec.lastActiveAt = new Date().toISOString();
  rec.tier = tierFromPoints(rec.points).key;

  const promoted = tierUp(previousPoints, rec.points);
  if (promoted) {
    rec.tierHistory.push({ tier: promoted.key, reachedAt: rec.lastActiveAt });
  }

  file.generatedAt = new Date().toISOString();
  await writeContributors(
    octokit,
    env.GH_REPO_OWNER,
    env.GH_REPO_NAME,
    env.DATA_PATH,
    file,
    sha,
    `chore(contributors): +${delta}pts for @${rec.username} (PR #${payload.pull_request.number})`,
  );

  await appendEvent(octokit, env.GH_REPO_OWNER, env.GH_REPO_NAME, env.EVENTS_PATH, {
    type: "pr_merged",
    user: rec.username,
    pr: payload.pull_request.number,
    delta,
    promoted: promoted?.key ?? null,
  });

  const cardProps = buildCardProps(rec, file);

  if (promoted) {
    const opts = await defaultRenderOpts();
    const png = await renderCardPng(promoted.key, cardProps, opts);
    const cardUrl = await uploadCardImage(
      octokit,
      env.GH_REPO_OWNER,
      env.GH_REPO_NAME,
      `data/cards/${rec.username}-${promoted.key}-${Date.now()}.png`,
      png,
    );

    await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner: env.GH_REPO_OWNER,
        repo: env.GH_REPO_NAME,
        issue_number: payload.pull_request.number,
        body: tierUpComment(cardProps, cardUrl),
      },
    );
  } else {
    const small = noTierUpComment(cardProps, delta);
    if (small) {
      await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner: env.GH_REPO_OWNER,
          repo: env.GH_REPO_NAME,
          issue_number: payload.pull_request.number,
          body: small,
        },
      );
    }
  }
}

interface WatchStarredPayload {
  action: "started";
  sender: UserRef;
  repository: { name: string; owner: { login: string } };
}

/**
 * Handle a star event ("watch.created" with action="started").
 * Spec §2.6: star → Spark/0 (silent record). No comment posted because stars
 * have no comment surface; the user just appears in CONTRIBUTORS.md.
 */
export async function handleWatchStarred(
  octokit: Octokit,
  env: WebhookEnv,
  payload: WatchStarredPayload,
): Promise<void> {
  if (!payload.sender || payload.sender.login.endsWith("[bot]")) return;

  const { data: file, sha } = await readContributors(
    octokit,
    env.GH_REPO_OWNER,
    env.GH_REPO_NAME,
    env.DATA_PATH,
  );

  const { rec, created } = ensureUser(file, payload.sender);
  if (!created) {
    return;
  }

  rec.lastActiveAt = new Date().toISOString();
  file.generatedAt = rec.lastActiveAt;

  await writeContributors(
    octokit,
    env.GH_REPO_OWNER,
    env.GH_REPO_NAME,
    env.DATA_PATH,
    file,
    sha,
    `chore(contributors): @${rec.username} just lit the first spark (star)`,
  );

  await appendEvent(octokit, env.GH_REPO_OWNER, env.GH_REPO_NAME, env.EVENTS_PATH, {
    type: "star_given",
    user: rec.username,
    delta: 0,
    promoted: "spark",
  });
}

interface IssueOpenedPayload {
  action: "opened";
  issue: {
    number: number;
    user: UserRef;
    pull_request?: unknown;
  };
  repository: { name: string; owner: { login: string } };
}

/**
 * Handle issues.opened. If this is the user's first surface with a comment
 * thread, post a Spark welcome card right there. Spec §2.6.
 */
export async function handleIssueOpened(
  octokit: Octokit,
  env: WebhookEnv,
  payload: IssueOpenedPayload,
): Promise<void> {
  if (payload.issue.pull_request) return;
  if (payload.issue.user.login.endsWith("[bot]")) return;

  const { data: file, sha } = await readContributors(
    octokit,
    env.GH_REPO_OWNER,
    env.GH_REPO_NAME,
    env.DATA_PATH,
  );

  const { rec } = ensureUser(file, payload.issue.user);
  const wasNewToPublicSurface = !hasHadPublicSurface(rec);

  rec.issuesAccepted += 1;
  rec.lastActiveAt = new Date().toISOString();
  file.generatedAt = rec.lastActiveAt;

  await writeContributors(
    octokit,
    env.GH_REPO_OWNER,
    env.GH_REPO_NAME,
    env.DATA_PATH,
    file,
    sha,
    `chore(contributors): @${rec.username} opened issue #${payload.issue.number}`,
  );

  await appendEvent(octokit, env.GH_REPO_OWNER, env.GH_REPO_NAME, env.EVENTS_PATH, {
    type: "issue_opened_accepted",
    user: rec.username,
    issue: payload.issue.number,
    delta: 0,
  });

  if (!wasNewToPublicSurface) return;

  const cardProps = buildCardProps(rec, file);
  const opts = await defaultRenderOpts();
  const png = await renderCardPng("spark", cardProps, opts);
  const cardUrl = await uploadCardImage(
    octokit,
    env.GH_REPO_OWNER,
    env.GH_REPO_NAME,
    `data/cards/${rec.username}-spark-${Date.now()}.png`,
    png,
  );

  await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner: env.GH_REPO_OWNER,
      repo: env.GH_REPO_NAME,
      issue_number: payload.issue.number,
      body: welcomeSparkComment(cardProps, cardUrl, true),
    },
  );
}

async function uploadCardImage(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  png: Uint8Array,
): Promise<string> {
  let bin = "";
  for (let i = 0; i < png.length; i++) bin += String.fromCharCode(png[i]!);
  const content = btoa(bin);

  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo,
    path,
    message: `chore(card): generated card`,
    content,
    committer: { name: "open-design-bot", email: "bot@nexu.io" },
  });

  return `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;
}

export { welcomeSparkComment };
