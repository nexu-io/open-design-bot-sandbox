export type TierKey = "spark" | "signal" | "node" | "beacon" | "nova";

export interface CardProps {
  username: string;
  avatarUrl: string;
  rank: number;
  totalContributors: number;
  topPercent: number;
  points: number;
  streakWeeks: number;
  prsMerged: number;
  reviews: number;
  discussionsAnswered: number;
  issuesAccepted: number;
}
