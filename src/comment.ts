import type { CardProps } from "./cards/types.ts";
import { tierFromPoints, nextTier } from "./tier.ts";
import { xShareUrl } from "./share.ts";
import { rankSummary } from "./rank.ts";

export function tierUpComment(card: CardProps, cardImageUrl: string): string {
  const tier = tierFromPoints(card.points);
  const xUrl = xShareUrl(card, "en");

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
    ``,
    `🔗 [Share on X](${xUrl})`,
    ``,
    `<sub>Open Design contributor recognition · [opt out with the \`.no-bot\` label](https://github.com/nexu-io/open-design#contributor-bot)</sub>`,
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

export function welcomeSparkComment(card: CardProps, cardImageUrl: string): string {
  return [
    `### 🎉 ✨ Welcome to **Open Design**, @${card.username}!`,
    ``,
    `<img src="${cardImageUrl}" width="420" alt="Spark card for @${card.username}" />`,
    ``,
    `> ✨ 🔥 *Lit the first spark.*`,
    ``,
    `🌱 Every great contribution starts with a single spark. You showed up — that's the hardest step.`,
    ``,
    `💛 Thanks for helping Open Design grow. Keep building in the open. 🚀`,
    ``,
  ].join("\n");
}
