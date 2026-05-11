import type { CardProps } from "./types.ts";
import { tierByKey } from "../tier.ts";

const TIER = tierByKey("spark");
const ACCENT = TIER.accent;

export function SparkCard(p: CardProps) {
  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #0B1E3F 0%, #050B20 100%)",
        color: "#F8FAFC",
        fontFamily: "Inter",
        padding: "60px 70px",
      }}
    >
      <div style={{ fontSize: 22, letterSpacing: 8, color: "#94A3B8", textAlign: "center", textTransform: "uppercase" }}>OPEN DESIGN · CONTRIBUTOR</div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 30 }}>
        <img
          src={p.avatarUrl}
          width={140}
          height={140}
          style={{
            borderRadius: 70,
            border: `4px solid ${ACCENT}`,
            boxShadow: `0 0 40px ${ACCENT}66`,
          }}
        />
        <div style={{ marginTop: 14, fontSize: 28, fontWeight: 500 }}>{`@${p.username}`}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 20 }}>
        <SparkBadge color={ACCENT} />
        <div style={{ fontSize: 100, fontWeight: 900, color: ACCENT, letterSpacing: 4, marginTop: 6, lineHeight: 1 }}>SPARK</div>
        <div style={{ fontSize: 28, color: ACCENT, marginTop: 4, opacity: 0.85 }}>火花</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 22 }}>
        <div style={{ fontSize: 80, fontWeight: 900, letterSpacing: -1 }}>{`Top ${p.topPercent.toFixed(0)}% · Rank #${p.rank.toLocaleString()}`}</div>
        <div style={{ fontSize: 30, color: "#CBD5E1", marginTop: 8 }}>{`${p.points} contributions · welcome aboard!`}</div>
      </div>

      <StatsGrid p={p} accent={ACCENT} />
      <SloganBox accent={ACCENT} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, gap: 16 }}>
        <Pill text="⭐ Star" accent={ACCENT} />
        <Pill text="👀 Issues" accent={ACCENT} />
        <Pill text="📊 Leaderboard" accent={ACCENT} />
      </div>

      <div style={{ marginTop: 18, textAlign: "center", fontSize: 18, color: "#94A3B8", letterSpacing: 1 }}>github.com/nexu-io/open-design</div>
    </div>
  );
}

function SparkBadge({ color }: { color: string }) {
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      <path
        d="M 70 10 L 80 60 L 130 70 L 80 80 L 70 130 L 60 80 L 10 70 L 60 60 Z"
        fill={color}
      />
      <circle cx="70" cy="70" r="50" fill="none" stroke={color} strokeOpacity="0.3" strokeWidth="2" />
    </svg>
  );
}

function StatsGrid({ p, accent }: { p: CardProps; accent: string }) {
  const stats = [
    { label: "PRs merged", value: p.prsMerged },
    { label: "reviews", value: p.reviews },
    { label: "discussions answered", value: p.discussionsAnswered },
    { label: "issues opened", value: p.issuesAccepted },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", marginTop: 22, gap: 14 }}>
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            width: 463,
            padding: "18px 24px",
            border: `1px solid ${accent}55`,
            borderRadius: 12,
            background: "#0B1E3F88",
            color: "#F8FAFC",
            fontSize: 26,
            fontWeight: 600,
          }}
        >{`${s.value}    ${s.label}`}</div>
      ))}
    </div>
  );
}

function SloganBox({ accent }: { accent: string }) {
  return (
    <div
      style={{
        marginTop: 22,
        padding: "20px 28px",
        border: `1px solid ${accent}88`,
        borderRadius: 14,
        background: `${accent}11`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 34, fontStyle: "italic", color: accent, fontWeight: 600 }}>{`"${TIER.sloganEn}"`}</div>
      <div style={{ fontSize: 22, color: "#E2E8F0", textAlign: "center", marginTop: 8, lineHeight: 1.45 }}>{`Every great contribution starts with a single spark. You showed up — that's the hardest step.`}</div>
    </div>
  );
}

function Pill({ text, accent }: { text: string; accent: string }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: "center",
        padding: "14px 0",
        border: `1px solid ${accent}99`,
        borderRadius: 999,
        fontSize: 24,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
}
