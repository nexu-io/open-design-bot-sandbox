import type { Octokit } from "@octokit/core";
import type { TierKey } from "./cards/types.ts";

export interface ContributorRecord {
  username: string;
  avatarUrl: string;
  points: number;
  tier: TierKey;
  prsMerged: number;
  reviews: number;
  discussionsAnswered: number;
  issuesAccepted: number;
  streakWeeks: number;
  lastActiveAt: string;
  founding: boolean;
  tierHistory: Array<{ tier: TierKey; reachedAt: string }>;
}

export interface ContributorsFile {
  generatedAt: string;
  totalContributors: number;
  contributors: Record<string, ContributorRecord>;
}

interface RepoFileResponse {
  type: string;
  content: string;
  sha: string;
  encoding: string;
}

const EMPTY_FILE: ContributorsFile = {
  generatedAt: new Date(0).toISOString(),
  totalContributors: 0,
  contributors: {},
};

export async function readContributors(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<{ data: ContributorsFile; sha: string | null }> {
  try {
    const r = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path,
    });
    const file = r.data as unknown as RepoFileResponse;
    const text = atob(file.content.replace(/\n/g, ""));
    return { data: JSON.parse(text) as ContributorsFile, sha: file.sha };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && err.status === 404) {
      return { data: { ...EMPTY_FILE }, sha: null };
    }
    throw err;
  }
}

const COMMITTER = { name: "open-design-bot", email: "bot@nexu.io" };

export async function writeContributors(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  data: ContributorsFile,
  sha: string | null,
  message: string,
): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const content = btoa(unescape(encodeURIComponent(json)));
  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo,
    path,
    message,
    content,
    committer: COMMITTER,
    ...(sha ? { sha } : {}),
  });
}

export async function appendEvent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  event: object,
): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n";

  let existing = "";
  let sha: string | null = null;
  try {
    const r = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path,
    });
    const file = r.data as unknown as RepoFileResponse;
    existing = atob(file.content.replace(/\n/g, ""));
    sha = file.sha;
  } catch (err: unknown) {
    if (!(err && typeof err === "object" && "status" in err && err.status === 404)) throw err;
  }

  const next = existing + line;
  const content = btoa(unescape(encodeURIComponent(next)));

  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo,
    path,
    message: `chore(events): append ${(event as { type?: string }).type ?? "event"}`,
    content,
    committer: COMMITTER,
    ...(sha ? { sha } : {}),
  });
}
