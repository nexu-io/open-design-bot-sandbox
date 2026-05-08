import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

import type { CardProps, TierKey } from "./cards/types.ts";
import { SparkCard } from "./cards/SparkCard.tsx";
import { SignalCard } from "./cards/SignalCard.tsx";
import { NodeCard } from "./cards/NodeCard.tsx";
import { BeaconCard } from "./cards/BeaconCard.tsx";
import { NovaCard } from "./cards/NovaCard.tsx";

const CARD_REGISTRY = {
  spark: SparkCard,
  signal: SignalCard,
  node: NodeCard,
  beacon: BeaconCard,
  nova: NovaCard,
} as const;

let resvgReady = false;
async function ensureResvg(wasmUrl: string): Promise<void> {
  if (resvgReady) return;
  const wasm = await fetch(wasmUrl).then((r) => r.arrayBuffer());
  await initWasm(wasm);
  resvgReady = true;
}

export interface RenderOptions {
  fontInter400: ArrayBuffer;
  fontInter900: ArrayBuffer;
  fontCjk400: ArrayBuffer;
  fontCjk900: ArrayBuffer;
  resvgWasmUrl: string;
}

export async function renderCardPng(
  tier: TierKey,
  props: CardProps,
  opts: RenderOptions,
): Promise<Uint8Array> {
  await ensureResvg(opts.resvgWasmUrl);

  const Component = CARD_REGISTRY[tier];
  const node = (Component as (p: CardProps) => unknown)(props);

  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: 1080,
    height: 1080,
    fonts: [
      { name: "Inter", data: opts.fontInter400, weight: 400, style: "normal" },
      { name: "Inter", data: opts.fontInter900, weight: 900, style: "normal" },
      { name: "Noto Sans SC", data: opts.fontCjk400, weight: 400, style: "normal" },
      { name: "Noto Sans SC", data: opts.fontCjk900, weight: 900, style: "normal" },
    ],
  });

  const resvg = new Resvg(svg);
  const png = resvg.render().asPng();
  return png;
}

const FONT_400_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf";
const FONT_900_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf";
const CJK_400_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf";
const CJK_900_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-900-normal.ttf";
const RESVG_WASM_URL =
  "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";

let cachedFonts: {
  f400: ArrayBuffer;
  f900: ArrayBuffer;
  cjk400: ArrayBuffer;
  cjk900: ArrayBuffer;
} | null = null;

export async function defaultRenderOpts(): Promise<RenderOptions> {
  if (!cachedFonts) {
    const [f400, f900, cjk400, cjk900] = await Promise.all([
      fetch(FONT_400_URL).then((r) => r.arrayBuffer()),
      fetch(FONT_900_URL).then((r) => r.arrayBuffer()),
      fetch(CJK_400_URL).then((r) => r.arrayBuffer()),
      fetch(CJK_900_URL).then((r) => r.arrayBuffer()),
    ]);
    cachedFonts = { f400, f900, cjk400, cjk900 };
  }
  return {
    fontInter400: cachedFonts.f400,
    fontInter900: cachedFonts.f900,
    fontCjk400: cachedFonts.cjk400,
    fontCjk900: cachedFonts.cjk900,
    resvgWasmUrl: RESVG_WASM_URL,
  };
}
