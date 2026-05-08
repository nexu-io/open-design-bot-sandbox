const API_BASE = "https://api.vaunt.dev/v1";
const PAGE_LIMIT = 100;
const MIN_SIGNAL_SCORE = 10;

export interface VauntContributorScore {
  login: string;
  score: number;
  rank: number;
  totalFetched: number;
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
  const target = login.toLowerCase();
  let cursor: string | undefined;
  let rank = 0;
  let totalFetched = 0;

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
    for (const contributor of humans) {
      rank += 1;
      if (contributor.name.toLowerCase() === target) {
        return {
          login: contributor.name,
          score: contributor.contributions,
          rank,
          totalFetched: Math.max(rank, totalFetched + humans.length),
        };
      }
    }

    totalFetched += humans.length;

    const minScoreOnPage = Math.min(...payload.data.map((contributor) => contributor.contributions));
    if (!payload.next_cursor || minScoreOnPage < MIN_SIGNAL_SCORE) {
      return null;
    }

    if (payload.next_cursor === cursor) return null;
    cursor = payload.next_cursor;
  }
}
