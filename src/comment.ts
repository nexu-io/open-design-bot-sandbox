import type { CardProps } from "./cards/types.ts";
import { tierFromPoints, nextTier } from "./tier.ts";
import { rankSummary } from "./rank.ts";

export function tierUpComment(card: CardProps, cardImageUrl: string): string {
  const tier = tierFromPoints(card.points);

  return [
    `### 🎉 ${tier.emoji} You just leveled up to **${tier.nameEn}**`,
    ``,
    `<img src="${cardImageUrl}" width="540" alt="${tier.nameEn} card for @${card.username}" />`,
    ``,
    `> ${tier.emoji} ✨ *${tier.sloganEn}*`,
    ``,
    `🙌 **${tier.encouragementEn}**`,
    ``,
    `💛 Thanks for helping Open Design move forward. Keep building in the open. 🚀`,
    ``,
    `---`,
    ``,
    `📊 ${rankSummary(card.rank, card.totalContributors)}`,
  ].join("\n");
}

export function noTierUpComment(
  card: CardProps,
  pointsEarned: number,
): string | null {
  const tier = tierFromPoints(card.points);
  const next = nextTier(tier.key);
  if (!next) return null;
  const remaining = next.threshold - card.points;

  return [
    `<sub>+${pointsEarned} contributions · ${card.points} total · ${remaining} to **${next.nameEn}** ${next.emoji}</sub>`,
  ].join("\n");
}

export function welcomeSparkComment(card: CardProps, cardImageUrl: string, isFirstContribution: boolean): string {
  const body = isFirstContribution
    ? `🌱 Your first contribution adds energy to the project. Thanks for showing up and helping Open Design grow.`
    : `🌱 Every contribution adds energy to the project. Thanks for showing up and helping Open Design grow.`;

  return [
    `### 🎉 ✨ Welcome to **Open Design**, @${card.username}!`,
    ``,
    `<img src="${cardImageUrl}" width="420" alt="Spark card for @${card.username}" />`,
    ``,
    `> ✨ 🔥 *Lit the spark.*`,
    ``,
    body,
    ``,
    `💛 Thanks for helping Open Design grow. Keep building in the open. 🚀`,
    ``,
  ].join("\n");
}
