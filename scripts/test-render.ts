/**
 * Render all 5 tier cards locally, save to ./out/ for visual review.
 *
 * Usage: pnpm test:render
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import type { CardProps, TierKey } from "../src/cards/types.ts";
import { SparkCard } from "../src/cards/SparkCard.tsx";
import { SignalCard } from "../src/cards/SignalCard.tsx";
import { NodeCard } from "../src/cards/NodeCard.tsx";
import { BeaconCard } from "../src/cards/BeaconCard.tsx";
import { NovaCard } from "../src/cards/NovaCard.tsx";

const REGISTRY = {
  spark: SparkCard,
  signal: SignalCard,
  node: NodeCard,
  beacon: BeaconCard,
  nova: NovaCard,
} as const;

const OCTOCAT_AVATAR = "https://avatars.githubusercontent.com/u/583231?v=4";

const SAMPLES: Record<TierKey, CardProps> = {
  spark: {
    username: "new_dev", avatarUrl: OCTOCAT_AVATAR,
    rank: 2210, totalContributors: 3772, topPercent: 60,
    points: 15, streakWeeks: 0,
    prsMerged: 0, reviews: 0, discussionsAnswered: 0, issuesAccepted: 2,
  },
  signal: {
    username: "first_pr_dev", avatarUrl: OCTOCAT_AVATAR,
    rank: 1050, totalContributors: 3772, topPercent: 28,
    points: 70, streakWeeks: 1,
    prsMerged: 1, reviews: 0, discussionsAnswered: 0, issuesAccepted: 0,
  },
  node: {
    username: "active_dev", avatarUrl: OCTOCAT_AVATAR,
    rank: 320, totalContributors: 3772, topPercent: 8,
    points: 420, streakWeeks: 5,
    prsMerged: 5, reviews: 12, discussionsAnswered: 3, issuesAccepted: 4,
  },
  beacon: {
    username: "senior_contributor", avatarUrl: OCTOCAT_AVATAR,
    rank: 145, totalContributors: 3772, topPercent: 4,
    points: 1250, streakWeeks: 10,
    prsMerged: 18, reviews: 45, discussionsAnswered: 12, issuesAccepted: 11,
  },
  nova: {
    username: "qiongyu1999", avatarUrl: OCTOCAT_AVATAR,
    rank: 7, totalContributors: 3772, topPercent: 0.5,
    points: 3240, streakWeeks: 18,
    prsMerged: 47, reviews: 120, discussionsAnswered: 35, issuesAccepted: 28,
  },
};

const FONT_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf";
const FONT_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf";
const CJK_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf";
const CJK_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-900-normal.ttf";

async function main() {
  mkdirSync(join(process.cwd(), "out"), { recursive: true });

  console.log("Loading fonts...");
  const [f400, f900, cjk400, cjk900] = await Promise.all([
    fetch(FONT_400_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_900_URL).then((r) => r.arrayBuffer()),
    fetch(CJK_400_URL).then((r) => r.arrayBuffer()),
    fetch(CJK_900_URL).then((r) => r.arrayBuffer()),
  ]);

  for (const tier of Object.keys(REGISTRY) as TierKey[]) {
    console.log(`Rendering ${tier}...`);
    const Component = REGISTRY[tier];
    const node = (Component as (p: CardProps) => unknown)(SAMPLES[tier]);
    const svg = await satori(node as Parameters<typeof satori>[0], {
      width: 1080,
      height: 1080,
      fonts: [
        { name: "Inter", data: f400, weight: 400, style: "normal" },
        { name: "Inter", data: f900, weight: 900, style: "normal" },
        { name: "Noto Sans SC", data: cjk400, weight: 400, style: "normal" },
        { name: "Noto Sans SC", data: cjk900, weight: 900, style: "normal" },
      ],
    });
    const png = new Resvg(svg).render().asPng();
    const outPath = join(process.cwd(), "out", `${tier}-test.png`);
    writeFileSync(outPath, png);
    console.log(`  → ${outPath}`);
  }

  console.log("");
  console.log("✅ Open ./out/*-test.png to review");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
