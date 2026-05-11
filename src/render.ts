import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

import type { CardProps, TierKey } from "./cards/types.ts";
import { CertificateCard } from "./cards/CertificateCard.tsx";
import { tierByKey } from "./tier.ts";

let resvgReady = false;
async function ensureResvg(wasmUrl: string): Promise<void> {
  if (resvgReady) return;
  const wasm = await fetch(wasmUrl).then((r) => r.arrayBuffer());
  await initWasm(wasm);
  resvgReady = true;
}

export interface RenderOptions {
  fontInter400: ArrayBuffer;
  fontInter700: ArrayBuffer;
  fontBebas: ArrayBuffer;
  fontPlayfair: ArrayBuffer;
  certificateBaseDataUrl: string;
  resvgWasmUrl: string;
}

export async function renderCardPng(
  tier: TierKey,
  props: CardProps,
  opts: RenderOptions,
): Promise<Uint8Array> {
  await ensureResvg(opts.resvgWasmUrl);

  const tierDef = tierByKey(tier);
  const node = CertificateCard({
    ...props,
    baseImageDataUrl: opts.certificateBaseDataUrl,
    tierNameEn: tierDef.nameEn,
  });

  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: 941,
    height: 1672,
    fonts: [
      { name: "Inter", data: opts.fontInter400, weight: 400, style: "normal" },
      { name: "Inter", data: opts.fontInter700, weight: 700, style: "normal" },
      { name: "Bebas", data: opts.fontBebas, weight: 400, style: "normal" },
      { name: "Playfair", data: opts.fontPlayfair, weight: 400, style: "normal" },
    ],
  });

  const resvg = new Resvg(svg);
  const png = resvg.render().asPng();
  return png;
}

const FONT_INTER_400_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf";
const FONT_INTER_700_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf";
const FONT_BEBAS_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/bebas-neue@latest/latin-400-normal.ttf";
const FONT_PLAYFAIR_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf";
const CERTIFICATE_BASE_URL =
  "https://raw.githubusercontent.com/nexu-io/open-design-bot-sandbox/main/assets/certificate-base.png";
const RESVG_WASM_URL =
  "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";

let cachedAssets: {
  inter400: ArrayBuffer;
  inter700: ArrayBuffer;
  bebas: ArrayBuffer;
  playfair: ArrayBuffer;
  baseDataUrl: string;
} | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  // btoa is available in Workers and modern Node (>=16)
  return btoa(binary);
}

export async function defaultRenderOpts(): Promise<RenderOptions> {
  if (!cachedAssets) {
    const [inter400, inter700, bebas, playfair, baseBuf] = await Promise.all([
      fetch(FONT_INTER_400_URL).then((r) => r.arrayBuffer()),
      fetch(FONT_INTER_700_URL).then((r) => r.arrayBuffer()),
      fetch(FONT_BEBAS_URL).then((r) => r.arrayBuffer()),
      fetch(FONT_PLAYFAIR_URL).then((r) => r.arrayBuffer()),
      fetch(CERTIFICATE_BASE_URL).then((r) => r.arrayBuffer()),
    ]);
    cachedAssets = {
      inter400,
      inter700,
      bebas,
      playfair,
      baseDataUrl: `data:image/png;base64,${arrayBufferToBase64(baseBuf)}`,
    };
  }
  return {
    fontInter400: cachedAssets.inter400,
    fontInter700: cachedAssets.inter700,
    fontBebas: cachedAssets.bebas,
    fontPlayfair: cachedAssets.playfair,
    certificateBaseDataUrl: cachedAssets.baseDataUrl,
    resvgWasmUrl: RESVG_WASM_URL,
  };
}
