/**
 * Render the Certificate card locally for visual review.
 *
 * Usage: pnpm tsx scripts/test-certificate.ts
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import { CertificateCard } from "../src/cards/CertificateCard.tsx";
import type { CardProps } from "../src/cards/types.ts";

const OCTOCAT_AVATAR = "https://avatars.githubusercontent.com/u/583231?v=4";

const SAMPLE: CardProps = {
  username: "username",
  avatarUrl: OCTOCAT_AVATAR,
  rank: 7,
  totalContributors: 3772,
  topPercent: 0.5,
  points: 3240,
  streakWeeks: 18,
  prsMerged: 7,
  reviews: 0,
  discussionsAnswered: 10,
  issuesAccepted: 4,
};

const FONT_400_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf";
const FONT_700_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf";
const FONT_900_URL = "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf";
const BEBAS_URL = "https://cdn.jsdelivr.net/fontsource/fonts/bebas-neue@latest/latin-400-normal.ttf";
const PLAYFAIR_URL = "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf";

async function main() {
  mkdirSync(join(process.cwd(), "out"), { recursive: true });

  console.log("Loading base image...");
  const baseBytes = readFileSync(join(process.cwd(), "assets/certificate-base.png"));
  const baseImageDataUrl = `data:image/png;base64,${baseBytes.toString("base64")}`;

  console.log("Loading fonts...");
  const [f400, f700, f900, bebas, playfair] = await Promise.all([
    fetch(FONT_400_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_700_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_900_URL).then((r) => r.arrayBuffer()),
    fetch(BEBAS_URL).then((r) => r.arrayBuffer()),
    fetch(PLAYFAIR_URL).then((r) => r.arrayBuffer()),
  ]);

  console.log("Rendering certificate...");
  const node = CertificateCard({
    ...SAMPLE,
    baseImageDataUrl,
    tierNameEn: "Da Vinci",
  });

  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: 941,
    height: 1672,
    fonts: [
      { name: "Inter", data: f400, weight: 400, style: "normal" },
      { name: "Inter", data: f700, weight: 700, style: "normal" },
      { name: "Inter", data: f900, weight: 900, style: "normal" },
      { name: "Bebas", data: bebas, weight: 400, style: "normal" },
      { name: "Playfair", data: playfair, weight: 400, style: "normal" },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  const outPath = join(process.cwd(), "out", "certificate-test.png");
  writeFileSync(outPath, png);
  console.log(`  → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
