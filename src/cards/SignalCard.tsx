import type { CardProps } from "./types.ts";
import { tierByKey } from "../tier.ts";

const TIER = tierByKey("signal");
const ACCENT = TIER.accent;
const BG_TOP = "#0B1E3F";
const BG_BOTTOM = "#050B20";

export function SignalCard(p: CardProps) {
  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BOTTOM} 100%)`,
        color: "#F8FAFC",
        fontFamily: "Inter",
        padding: "60px 70px",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: 22,
          letterSpacing: 8,
          color: "#94A3B8",
          textAlign: "center",
          textTransform: "uppercase",
        }}
      >
        Open Design · Contributor
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 30,
        }}
      >
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 20,
        }}
      >
        <SignalBadge color={ACCENT} />
        <div
          style={{
            fontSize: 100,
            fontWeight: 900,
            color: ACCENT,
            letterSpacing: 4,
            marginTop: 6,
            lineHeight: 1,
          }}
        >
          {TIER.nameEn.toUpperCase()}
        </div>
        <div style={{ fontSize: 28, color: ACCENT, marginTop: 4, opacity: 0.85 }}>
          {TIER.nameCn}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 22,
        }}
      >
        <div style={{ fontSize: 80, fontWeight: 900, letterSpacing: -1 }}>
          {`Top ${p.topPercent.toFixed(1)}% · Rank #${p.rank.toLocaleString()}`}
        </div>
        <div style={{ fontSize: 30, color: "#CBD5E1", marginTop: 8 }}>
          {`${p.points} contributions${p.streakWeeks > 0 ? ` · 🔥 ${p.streakWeeks}w streak` : ""}`}
        </div>
      </div>

      <StatsGrid p={p} accent={ACCENT} />

      <SloganBox accent={ACCENT} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 24,
          gap: 16,
        }}
      >
        <Pill text="⭐ Star" accent={ACCENT} />
        <Pill text="👀 Issues" accent={ACCENT} />
        <Pill text="📊 Leaderboard" accent={ACCENT} />
      </div>

      <div
        style={{
          marginTop: 18,
          textAlign: "center",
          fontSize: 18,
          color: "#94A3B8",
          letterSpacing: 1,
        }}
      >
        github.com/nexu-io/open-design
      </div>
    </div>
  );
}

function SignalBadge({ color }: { color: string }) {
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      <defs>
        <radialGradient id="dot" cx="50%" cy="50%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <circle cx="70" cy="70" r="14" fill={color} />
      <path d="M 30 70 A 40 40 0 0 1 110 70" stroke={color} strokeWidth="4" fill="none" opacity="0.85" />
      <path d="M 22 70 A 48 48 0 0 1 118 70" stroke={color} strokeWidth="3" fill="none" opacity="0.55" />
      <path d="M 14 70 A 56 56 0 0 1 126 70" stroke={color} strokeWidth="2" fill="none" opacity="0.3" />
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
      <div
        style={{
          fontSize: 34,
          fontStyle: "italic",
          color: accent,
          fontWeight: 600,
        }}
      >
        {`"${TIER.sloganEn}"`}
      </div>
      <div
        style={{
          fontSize: 22,
          color: "#E2E8F0",
          textAlign: "center",
          marginTop: 8,
          lineHeight: 1.45,
        }}
      >
        Your first contribution didn't just merge code — it sent a signal across the network: "I'm here, and I care."
      </div>
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
