import type { CardProps } from "./types.ts";

export interface CertificateCardProps extends CardProps {
  baseImageDataUrl: string;
  tierNameEn: string;
}

const SLOGAN = "Lit the first spark.";

const W = 941;
const H = 1672;

const INK = "#1F1B16";
const ORANGE = "#C2532D";
const PLAQUE_GOLD = "#9C7B3F";

export function CertificateCard(p: CertificateCardProps) {
  const topPct = p.topPercent < 10
    ? p.topPercent.toFixed(1).replace(/\.0$/, "")
    : p.topPercent.toFixed(0);
  const points = p.points.toLocaleString();
  const tierLabel = `${p.tierNameEn.toUpperCase()} TIER`;

  return (
    <div
      style={{
        width: W,
        height: H,
        position: "relative",
        display: "flex",
        fontFamily: "Inter",
      }}
    >
      <img
        src={p.baseImageDataUrl}
        width={W}
        height={H}
        style={{ position: "absolute", top: 0, left: 0 }}
      />

      <div
        style={{
          position: "absolute",
          top: 282,
          left: 52,
          width: 132,
          height: 132,
          borderRadius: 66,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <img src={p.avatarUrl} width={132} height={132} />
      </div>

      <div
        style={{
          position: "absolute",
          top: 325,
          left: 210,
          display: "flex",
          alignItems: "center",
          fontSize: 44,
          fontWeight: 600,
          color: INK,
        }}
      >
        {`@${p.username}`}
      </div>

      <div
        style={{
          position: "absolute",
          top: 470,
          left: 50,
          display: "flex",
          color: INK,
          fontSize: 280,
          fontFamily: "Bebas",
          fontWeight: 700,
          letterSpacing: 0,
          lineHeight: 1,
        }}
      >
        TOP
      </div>
      <div
        style={{
          position: "absolute",
          top: 470,
          left: 410,
          display: "flex",
          color: INK,
          fontSize: 280,
          fontFamily: "Bebas",
          fontWeight: 700,
          letterSpacing: 0,
          lineHeight: 1,
        }}
      >
        {`${topPct}%`}
      </div>

      <div
        style={{
          position: "absolute",
          top: 820,
          left: 60,
          display: "flex",
          alignItems: "baseline",
          color: ORANGE,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 134,
            fontFamily: "Bebas",
            fontWeight: 700,
            letterSpacing: 0,
            lineHeight: 1,
          }}
        >
          {points}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 90,
            fontFamily: "Bebas",
            fontWeight: 700,
            letterSpacing: 4,
            marginLeft: 28,
            lineHeight: 1,
          }}
        >
          POINTS
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 970,
          left: 60,
          width: 500,
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          fontFamily: "Bebas",
          fontWeight: 700,
          letterSpacing: 6,
          color: PLAQUE_GOLD,
        }}
      >
        {tierLabel}
      </div>

      <div
        style={{
          position: "absolute",
          top: 1070,
          left: 45,
          width: 460,
          display: "flex",
          justifyContent: "space-between",
          color: INK,
        }}
      >
        <StatItem value={p.prsMerged} label="PRs" />
        <StatItem value={p.discussionsAnswered} label="Discussions" />
        <StatItem value={p.issuesAccepted} label="Issues" />
      </div>

      <div
        style={{
          position: "absolute",
          top: 1250,
          left: 60,
          display: "flex",
          fontSize: 48,
          fontFamily: "Playfair",
          fontWeight: 400,
          color: INK,
          letterSpacing: -0.5,
        }}
      >
        {SLOGAN}
      </div>
    </div>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 140,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 72,
          fontFamily: "Bebas",
          fontWeight: 400,
          lineHeight: 1,
        }}
      >
        {String(value)}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          fontWeight: 500,
          marginTop: 6,
          color: "#5C5247",
        }}
      >
        {label}
      </div>
    </div>
  );
}
