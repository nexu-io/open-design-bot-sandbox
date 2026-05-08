import type { TierKey } from "./cards/types.ts";

export interface TierDef {
  key: TierKey;
  emoji: string;
  nameEn: string;
  nameCn: string;
  threshold: number;
  accent: string;
  sloganEn: string;
  sloganCn: string;
  encouragementEn: string;
  encouragementCn: string;
}

export const TIERS: ReadonlyArray<TierDef> = [
  {
    key: "spark",
    emoji: "✨",
    nameEn: "Spark",
    nameCn: "火花",
    threshold: 0,
    accent: "#FCD34D",
    sloganEn: "Lit the first spark.",
    sloganCn: "点燃第一束火花。",
    encouragementEn:
      "Every great contribution starts with a single spark. You showed up — that's the hardest step. Welcome to Open Design.",
    encouragementCn:
      "每一个伟大的贡献都从一束微小的火花开始。你来了——这就是最难的一步。欢迎加入 Open Design。",
  },
  {
    key: "signal",
    emoji: "📡",
    nameEn: "Signal",
    nameCn: "信号",
    threshold: 30,
    accent: "#22D3EE",
    sloganEn: "Sending steady signals.",
    sloganCn: "发出第一道信号。",
    encouragementEn:
      "Your first contribution didn't just merge code — it sent a signal across the network: \"I'm here, and I care.\" Keep transmitting.",
    encouragementCn:
      "你的第一次贡献不只是合入了代码——它向整个网络发出了一个信号：\"我在这里，我用心了\"。继续发声。",
  },
  {
    key: "node",
    emoji: "🔵",
    nameEn: "Node",
    nameCn: "节点",
    threshold: 150,
    accent: "#3B82F6",
    sloganEn: "Holding the network together.",
    sloganCn: "撑起网络的节点。",
    encouragementEn:
      "You're no longer just passing through. You've become a node — a point others rely on, build on, and connect through. The network is stronger because of you.",
    encouragementCn:
      "你不再只是路过。你已经长成了一个节点——一个别人可以依靠、可以连接、可以建造的点。整个网络因为你而更稳固。",
  },
  {
    key: "beacon",
    emoji: "🗼",
    nameEn: "Beacon",
    nameCn: "灯塔",
    threshold: 700,
    accent: "#F59E0B",
    sloganEn: "Guiding the way for others.",
    sloganCn: "为他人指引方向。",
    encouragementEn:
      "Most contributors come and go. You stayed long enough to become a guide. New contributors look to your reviews, your judgement, your taste. You're shaping how Open Design feels — for everyone who comes after you.",
    encouragementCn:
      "大多数贡献者来了又走。你留得足够久，长成了一座灯塔。新人寻找你的 review、你的判断、你的品味。你正在塑造 Open Design 的气质——为每一个之后到来的人。",
  },
  {
    key: "nova",
    emoji: "🌟",
    nameEn: "Nova",
    nameCn: "新星",
    threshold: 2500,
    accent: "#67E8F9",
    sloganEn: "Bright as a Nova.",
    sloganCn: "如新星般璀璨。",
    encouragementEn:
      "Only a handful will ever reach this point. You didn't just help — you defined what Open Design could become. When the world looks at this project, your work is part of what they see. Burn bright.",
    encouragementCn:
      "整个项目的历史上，只有极少数人能到达这一步。你不只是帮过忙——你定义了 Open Design 能成为什么样子。当世界看向这个项目时，你的工作就是他们看到的一部分。继续闪耀。",
  },
] as const;

export function tierFromPoints(points: number): TierDef {
  let current = TIERS[0]!;
  for (const t of TIERS) {
    if (points >= t.threshold) current = t;
  }
  return current;
}

export function tierByKey(key: TierKey): TierDef {
  const t = TIERS.find((x) => x.key === key);
  if (!t) throw new Error(`Unknown tier: ${key}`);
  return t;
}

export function nextTier(key: TierKey): TierDef | null {
  const i = TIERS.findIndex((x) => x.key === key);
  if (i < 0 || i === TIERS.length - 1) return null;
  return TIERS[i + 1] ?? null;
}

export function tierUp(prevPoints: number, newPoints: number): TierDef | null {
  const prev = tierFromPoints(prevPoints);
  const next = tierFromPoints(newPoints);
  return prev.key === next.key ? null : next;
}
