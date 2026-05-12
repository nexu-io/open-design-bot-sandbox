import type { CardProps } from "./cards/types.ts";
import { fuzzyContributorCount } from "./rank.ts";

const REPO_URL = "https://github.com/nexu-io/open-design";

export function xShareUrl(card: CardProps, lang: "en" | "cn" = "en"): string {
  const contributorCount = fuzzyContributorCount(card.totalContributors);
  const text =
    lang === "cn"
      ? `Open Design 是 Claude Design 的开源、本地优先替代品，用你已有的 coding-agent CLI 把 prompt 变成可交付的设计产物。\n\n在 ${contributorCount} Open Design 贡献者中排名 #${card.rank}。\n\n很开心参与这个开源项目，一起把产品做得更好。\n\n#OpenDesign · ${REPO_URL}`
      : `Open Design is the open-source, local-first alternative to Claude Design, turning prompts into design artifacts with the coding-agent CLI you already use.\n\nRanked #${card.rank} among ${contributorCount} Open Design contributors.\n\nGlad to be building in the open.\n\n${REPO_URL}`;
  const params = new URLSearchParams({ text });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}
