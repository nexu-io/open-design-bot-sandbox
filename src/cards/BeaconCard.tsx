import type { CardProps } from "./types.ts";
import { tierByKey } from "../tier.ts";

const TIER = tierByKey("beacon");
const ACCENT = TIER.accent;

export function BeaconCard(p: CardProps) {
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
      <div style={{ fontSize: 22, letterSpacing: 8, color: "#94A3B8", textAlign: "center", textTransform: "uppercase" }}>
        Open Design · Contributor
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 30 }}>
        <img src={p.avatarUrl} width={140} height={140}
          style={{ borderRadius: 70, border: `4px solid ${ACCENT}`, boxShadow: `0 0 40px ${ACCENT}66` }} />
        <div style={{ marginTop: 14, fontSize: 28, fontWeight: 500 }}>{`@${p.username}`}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 20 }}>
        <BeaconBadge color={ACCENT} />
        <div style={{ fontSize: 100, fontWeight: 900, color: ACCENT, letterSpacing: 4, marginTop: 6, lineHeight: 1 }}>
          BEACON
        </div>
        <div style={{ fontSize: 28, color: ACCENT, marginTop: 4, opacity: 0.85 }}>灯塔</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 22 }}>
        <div style={{ fontSize: 80, fontWeight: 900, letterSpacing: -1 }}>
          {`Top ${p.topPercent.toFixed(0)}% · Rank #${p.rank.toLocaleString()}`}
        </div>
        <div style={{ fontSize: 30, color: "#CBD5E1", marginTop: 8 }}>
          {`${p.points.toLocaleString()} points${p.streakWeeks > 0 ? ` · 🔥 ${p.streakWeeks}w streak` : ""}`}
        </div>
      </div>

      <StatsGrid p={p} accent={ACCENT} />
      <SloganBox accent={ACCENT} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, gap: 16 }}>
        <Pill text="⭐ Star" accent={ACCENT} />
        <Pill text="👀 Issues" accent={ACCENT} />
        <Pill text="📊 Leaderboard" accent={ACCENT} />
      </div>

      <div style={{ marginTop: 18, textAlign: "center", fontSize: 18, color: "#94A3B8", letterSpacing: 1 }}>
        github.com/nexu-io/open-design
      </div>
    </div>
  );
}

function BeaconBadge({ color }: { color: string }) {
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      <defs>
        <linearGradient id="beam" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.6" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M 60 10 L 80 10 L 75 30 L 65 30 Z" fill={color} opacity="0.9" />
      <path d="M 50 30 L 90 30 L 85 90 L 55 90 Z" fill={color} opacity="0.85" />
      <rect x="45" y="90" width="50" height="10" fill={color} opacity="0.85" />
      <rect x="40" y="100" width="60" height="20" fill={color} opacity="0.7" />
      <path d="M 55 40 L 85 40 L 80 80 L 60 80 Z" fill={color} opacity="0.5" />
      <path d="M 55 0 L 85 0 L 100 30 L 40 30 Z" fill="url(#beam)" />
      <circle cx="70" cy="20" r="6" fill="#fff" />
    </svg>
  );
}

function StatsGrid({ p, accent }: { p: CardProps; accent: string }) {
  const stats = [
    { label: "PRs merged", value: p.prsMerged },
    { label: "reviews", value: p.reviews },
    { label: "discussions answered", value: p.discussionsAnswered },
    { label: "issues accepted", value: p.issuesAccepted },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", marginTop: 22, gap: 14 }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          width: 463, padding: "18px 24px",
          border: `1px solid ${accent}55`, borderRadius: 12, background: "#0B1E3F88",
          color: "#F8FAFC", fontSize: 26, fontWeight: 600,
        }}>{`${s.value}    ${s.label}`}</div>
      ))}
    </div>
  );
}

function SloganBox({ accent }: { accent: string }) {
  return (
    <div style={{
      marginTop: 22, padding: "20px 28px", border: `1px solid ${accent}88`,
      borderRadius: 14, background: `${accent}11`, display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ fontSize: 34, fontStyle: "italic", color: accent, fontWeight: 600 }}>
        {`"${TIER.sloganEn}"`}
      </div>
      <div style={{ fontSize: 22, color: "#E2E8F0", textAlign: "center", marginTop: 8, lineHeight: 1.45 }}>
        You stayed long enough to become a guide. New contributors look to your reviews, your judgement, your taste.
      </div>
    </div>
  );
}

function Pill({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "14px 0",
      border: `1px solid ${accent}99`, borderRadius: 999, fontSize: 24, fontWeight: 600,
    }}>
      {text}
    </div>
  );
}
