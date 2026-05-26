import type { Octokit } from "@octokit/core";
import type { ContributorRecord, ContributorsFile } from "./storage.ts";
import { readContributors, writeContributors, appendEvent } from "./storage.ts";
import { POINTS, applyMultiplier } from "./scoring.ts";
import { tierFromPoints, tierUp } from "./tier.ts";
import { tierUpComment, noTierUpComment, welcomeSparkComment } from "./comment.ts";
import { renderCardPng, defaultRenderOpts } from "./render.ts";
import type { CardProps } from "./cards/types.ts";
import {
  sendEmailViaResend,
  tierUpEmail,
  welcomeSparkEmail,
  type ResendEnv,
} from "./email.ts";

export interface WebhookEnv extends ResendEnv {
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

    const eventId = `${rec.username}-${promoted.key}-${Date.now()}`;

    const commentRes = await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner: env.GH_REPO_OWNER,
        repo: env.GH_REPO_NAME,
        issue_number: payload.pull_request.number,
        body: tierUpComment(cardProps, cardUrl, eventId),
      },
    );

    const commentUrl =
      (commentRes.data as { html_url?: string }).html_url ??
      `https://github.com/${env.GH_REPO_OWNER}/${env.GH_REPO_NAME}/pull/${payload.pull_request.number}`;

    await sendCardEmailSafe(octokit, env, {
      kind: "tier-up",
      username: rec.username,
      prNumber: payload.pull_request.number,
      cardProps,
      cardImageUrl: cardUrl,
      commentUrl,
      eventId,
    });
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

  const eventId = `${rec.username}-spark-${Date.now()}`;

  const commentRes = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner: env.GH_REPO_OWNER,
      repo: env.GH_REPO_NAME,
      issue_number: payload.issue.number,
      body: welcomeSparkComment(cardProps, cardUrl, true, eventId),
    },
  );

  const commentUrl =
    (commentRes.data as { html_url?: string }).html_url ??
    `https://github.com/${env.GH_REPO_OWNER}/${env.GH_REPO_NAME}/issues/${payload.issue.number}`;

  await sendCardEmailSafe(octokit, env, {
    kind: "spark",
    username: rec.username,
    prNumber: null,
    cardProps,
    cardImageUrl: cardUrl,
    commentUrl,
    eventId,
  });
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

interface SendCardEmailArgs {
  kind: "tier-up" | "spark";
  username: string;
  prNumber: number | null;
  cardProps: CardProps;
  cardImageUrl: string;
  commentUrl: string;
  eventId: string;
}

/**
 * Send the contributor recognition email alongside the GitHub comment.
 *
 * Synchronous in the JS sense (awaited within the webhook handler) so the
 * email lands at roughly the same moment as the card comment, but the call
 * is wrapped in try/catch + logged: a Resend hiccup or a missing email
 * address must never break the comment path.
 */
async function sendCardEmailSafe(
  octokit: Octokit,
  env: WebhookEnv,
  args: SendCardEmailArgs,
): Promise<void> {
  try {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
      console.log(
        `[email] resend not configured — skipping ${args.kind} email for @${args.username}`,
      );
      return;
    }

    const to = await lookupContributorEmail(
      octokit,
      args.username,
      args.prNumber,
      env.GH_REPO_OWNER,
      env.GH_REPO_NAME,
    );

    if (!to) {
      console.log(
        `[email] no usable email for @${args.username} — skipping ${args.kind} email`,
      );
      return;
    }

    const built =
      args.kind === "tier-up"
        ? tierUpEmail(
            args.cardProps,
            args.cardImageUrl,
            args.commentUrl,
            args.eventId,
          )
        : welcomeSparkEmail(
            args.cardProps,
            args.cardImageUrl,
            args.commentUrl,
            args.eventId,
          );

    const res = await sendEmailViaResend(env, {
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      tags: [
        { name: "kind", value: args.kind },
        { name: "event_id", value: args.eventId.slice(0, 64) },
      ],
    });

    if (res.ok) {
      console.log(
        `[email] sent ${args.kind} email to @${args.username} id=${res.id}`,
      );
    } else if (!res.skipped) {
      console.warn(
        `[email] failed to send ${args.kind} email to @${args.username}: ${res.error}`,
      );
    }
  } catch (err) {
    console.error(`[email] unexpected error sending ${args.kind} email:`, err);
  }
}

/**
 * Look up a usable email for a contributor.
 *
 * Strategy:
 *   1. If we have a PR number, scan its commits and use the author email
 *      whose `author.login` matches the username. This is the most
 *      reliable signal — it's the email they configured for git.
 *   2. Fall back to the public profile email exposed by GitHub.
 *   3. Filter out GitHub's `users.noreply.github.com` privacy proxy —
 *      those addresses are not deliverable through Resend.
 */
async function lookupContributorEmail(
  octokit: Octokit,
  username: string,
  prNumber: number | null,
  owner: string,
  repo: string,
): Promise<string | null> {
  if (prNumber !== null) {
    try {
      const r = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/commits",
        { owner, repo, pull_number: prNumber, per_page: 100 },
      );
      const commits = r.data as Array<{
        author?: { login?: string } | null;
        commit: { author?: { email?: string; name?: string } };
      }>;
      for (const c of commits) {
        if (c.author?.login !== username) continue;
        const email = c.commit.author?.email ?? null;
        if (email && !isPrivacyEmail(email)) return email;
      }
    } catch (err) {
      console.warn(`[email] could not fetch PR #${prNumber} commits:`, err);
    }
  }

  try {
    const r = await octokit.request("GET /users/{username}", { username });
    const email = (r.data as { email?: string | null }).email ?? null;
    if (email && !isPrivacyEmail(email)) return email;
  } catch (err) {
    console.warn(`[email] could not fetch profile for @${username}:`, err);
  }

  return null;
}

function isPrivacyEmail(email: string): boolean {
  return /@users\.noreply\.github\.com$/i.test(email);
}

export { welcomeSparkComment };
