/**
 * Point values per action.
 * Centralized so v1.5 / v2 can tweak weights without touching event handlers.
 */
export const POINTS = {
  pr_merged: 12,
  pr_merged_first_time_bonus: 18,
  pr_review_substantial: 4,
  pr_review_approved: 2,
  issue_opened_accepted: 5,
  issue_opened_invalid: 0,
  issue_comment_helpful: 1,
  discussion_answered_accepted: 6,
  discussion_started: 2,
  commit_authored: 1,
  pr_reverted_penalty: -10,
  star_given: 0,
} as const;

/** Streak multiplier: ≥4 consecutive weeks → 1.2x */
export function streakMultiplier(streakWeeks: number): number {
  return streakWeeks >= 4 ? 1.2 : 1.0;
}

/** Apply streak multiplier and round to integer. */
export function applyMultiplier(rawPoints: number, streakWeeks: number): number {
  return Math.round(rawPoints * streakMultiplier(streakWeeks));
}

export interface ScoringEvent {
  type: keyof typeof POINTS;
  user: string;
  timestamp: string;
  contextId?: string;
  rawDelta?: number;
}

export function rawDelta(type: ScoringEvent["type"]): number {
  return POINTS[type];
}
