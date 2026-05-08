import type { CardProps } from "./cards/types.ts";
import { tierFromPoints } from "./tier.ts";

const REPO_URL = "https://github.com/nexu-io/open-design";

export function xShareUrl(card: CardProps, lang: "en" | "cn" = "en"): string {
  const tier = tierFromPoints(card.points);
  const text =
    lang === "cn"
      ? `刚刚升到 ${tier.emoji} ${tier.nameCn} 段位（Top ${card.topPercent.toFixed(1)}% · #${card.rank}）！\n${tier.sloganCn}\n\n#OpenDesign · ${REPO_URL}`
      : `Just leveled up to ${tier.emoji} ${tier.nameEn} on Open Design — Top ${card.topPercent.toFixed(1)}%, #${card.rank} globally.\n"${tier.sloganEn}"\n\n${REPO_URL}`;
  const params = new URLSearchParams({ text });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}
