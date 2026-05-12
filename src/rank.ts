export function fuzzyContributorCount(total: number): string {
  const count = Math.max(0, Math.floor(total));
  if (count >= 100) {
    return `${Math.floor(count / 100) * 100}+`;
  }
  return count.toLocaleString();
}

export function rankSummary(rank: number, totalContributors: number): string {
  return `Rank #${rank.toLocaleString()} among ${fuzzyContributorCount(totalContributors)} contributors`;
}
