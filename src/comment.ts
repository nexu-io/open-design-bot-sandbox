import type { CardProps } from "./cards/types.ts";
import { tierFromPoints, nextTier } from "./tier.ts";
import { xShareUrl } from "./share.ts";
import { rankSummary } from "./rank.ts";

export function tierUpComment(card: CardProps, cardImageUrl: string): string {
  const tier = tierFromPoints(card.points);
  const xUrl = xShareUrl(card, "en");
  const xUrlCn = xShareUrl(card, "cn");

  return [
    `### ${tier.emoji} You just leveled up to **${tier.nameEn}** (${tier.nameCn})`,
    ``,
    `<img src="${cardImageUrl}" width="540" alt="${tier.nameEn} card for @${card.username}" />`,
    ``,
    `> *${tier.sloganEn}*`,
    ``,
    `**${tier.encouragementEn}**`,
    ``,
    `---`,
    ``,
    `📊 ${rankSummary(card.rank, card.totalContributors)}`,
    ``,
    `🔗 [Share on X (English)](${xUrl}) · [分享到 X（中文）](${xUrlCn})`,
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
    `### ✨ Welcome to **Open Design**, @${card.username}!`,
    ``,
    `<img src="${cardImageUrl}" width="420" alt="Spark card for @${card.username}" />`,
    ``,
    `> *Lit the first spark.*`,
    ``,
    `Every great contribution starts with a single spark. You showed up — that's the hardest step.`,
    ``,
    `<sub>Track your progress on the [contributor leaderboard](https://github.com/nexu-io/open-design/blob/main/CONTRIBUTORS.md)</sub>`,
  ].join("\n");
}
