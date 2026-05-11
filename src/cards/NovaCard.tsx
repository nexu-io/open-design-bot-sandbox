import type { CardProps } from "./types.ts";
import { tierByKey } from "../tier.ts";

const TIER = tierByKey("nova");
const ACCENT = TIER.accent;
const CORE = "#F8FAFC";

export function NovaCard(p: CardProps) {
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
          style={{ borderRadius: 70, border: `4px solid ${CORE}`, boxShadow: `0 0 40px ${ACCENT}` }} />
        <div style={{ marginTop: 14, fontSize: 28, fontWeight: 500 }}>{`@${p.username}`}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 20 }}>
        <NovaBadge core={CORE} halo={ACCENT} />
        <div style={{ fontSize: 100, fontWeight: 900, color: CORE, letterSpacing: 4, marginTop: 6, lineHeight: 1 }}>
          NOVA
        </div>
        <div style={{ fontSize: 28, color: ACCENT, marginTop: 4, opacity: 0.85 }}>新星</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 22 }}>
        <div style={{ fontSize: 80, fontWeight: 900, letterSpacing: -1 }}>
          {`Top ${p.topPercent.toFixed(1)}% · Rank #${p.rank.toLocaleString()}`}
        </div>
        <div style={{ fontSize: 30, color: "#CBD5E1", marginTop: 8 }}>
          {`${p.points.toLocaleString()} contributions${p.streakWeeks > 0 ? ` · 🔥 ${p.streakWeeks}w streak` : ""}`}
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

function NovaBadge({ core, halo }: { core: string; halo: string }) {
  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      <defs>
        <radialGradient id="halo">
          <stop offset="0%" stopColor={halo} stopOpacity="1" />
          <stop offset="60%" stopColor={halo} stopOpacity="0.3" />
          <stop offset="100%" stopColor={halo} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="80" cy="80" r="70" fill="url(#halo)" />
      <path
        d="M 80 10 L 90 70 L 150 80 L 90 90 L 80 150 L 70 90 L 10 80 L 70 70 Z"
        fill={core}
      />
      <path
        d="M 80 30 L 86 74 L 130 80 L 86 86 L 80 130 L 74 86 L 30 80 L 74 74 Z"
        fill={halo}
        opacity="0.5"
      />
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
        Only a handful will ever reach this point. You defined what Open Design could become.
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
