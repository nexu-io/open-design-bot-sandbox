const API_BASE = "https://api.vaunt.dev/v1";
const PAGE_LIMIT = 100;
const MIN_SIGNAL_SCORE = 10;

export interface VauntContributorScore {
  login: string;
  score: number;
  rank: number;
  totalFetched: number;
}

export interface VauntContributorLookup {
  score: VauntContributorScore | null;
  totalContributors: number;
}

interface VauntContributor {
  name: string;
  display_name: string;
  type: string;
  avatar_url: string;
  contributions: number;
}

interface VauntContributorsResponse {
  data: VauntContributor[];
  next_cursor?: string;
}

function isBotName(login: string): boolean {
  return (
    /\[bot\]$/i.test(login) ||
    /^bot-/i.test(login) ||
    /-bot$/i.test(login) ||
    /github-actions/i.test(login) ||
    /chatgpt-codex-connector/i.test(login) ||
    /copilot/i.test(login) ||
    /coderabbit/i.test(login) ||
    /codecov/i.test(login) ||
    /dependabot/i.test(login) ||
    /renovate/i.test(login) ||
    /vercel/i.test(login) ||
    /netlify/i.test(login)
  );
}

function isBot(contributor: VauntContributor): boolean {
  return contributor.type.toLowerCase() === "bot" || isBotName(contributor.name);
}

export async function fetchVauntContributorScore(
  owner: string,
  repo: string,
  login: string,
): Promise<VauntContributorScore | null> {
  const lookup = await fetchVauntContributorLookup(owner, repo, login);
  return lookup.score;
}

export async function fetchVauntContributorLookup(
  owner: string,
  repo: string,
  login: string,
): Promise<VauntContributorLookup> {
  const target = login.toLowerCase();
  let cursor: string | undefined;
  let rank = 0;
  let match: Omit<VauntContributorScore, "totalFetched"> | null = null;
  const seen = new Set<string>();

  while (true) {
    const url = new URL(`${API_BASE}/github/entities/${owner}/repositories/${repo}/contributors`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("after", cursor);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Vaunt API failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as VauntContributorsResponse;
    const humans = payload.data.filter((contributor) => !isBot(contributor));
    const minHumanScore = Math.min(...humans.map((contributor) => contributor.contributions));
    for (const contributor of humans) {
      const key = contributor.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rank += 1;
      if (key === target) {
        match = {
          login: contributor.name,
          score: contributor.contributions,
          rank,
        };
      }
    }

    if (match && minHumanScore < match.score) {
      break;
    }

    if (!payload.next_cursor) {
      break;
    }

    if (payload.next_cursor === cursor) {
      break;
    }

    if (!match && minHumanScore < MIN_SIGNAL_SCORE) {
      break;
    }

    cursor = payload.next_cursor;
  }

  return {
    score: match ? { ...match, totalFetched: seen.size } : null,
    totalContributors: seen.size,
  };
}
