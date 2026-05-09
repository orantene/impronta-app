"use client";

// ============================================================================
// _metrics-ribbon.tsx — Phase 5.2: Earned-trust ribbon for the talent drawer.
//
// Renders a horizontal ribbon at the top of the profile showing:
//   ⚡ Active 2 days ago · 12 bookings · 3 skills verified · 2 trust badges
//
// When all metrics are 0/null (new talent), shows "New on Tulala" instead of
// hollow placeholders.
//
// Currently READ-ONLY. Phase 5.1 (populator) will write the values from
// real activity. For now, last_active_at updates on profile edit.
// ============================================================================

import React, { useEffect, useState } from "react";
import {
  getTalentMetrics,
  type TalentMetrics,
} from "@/lib/server-actions/admin-talent-metrics";

const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2EB",
  surfaceWarm: "#F9F7F1",
  border: "#D5D2C7",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.12)",
  indigo: "#5B6BA0",
  indigoSoft: "rgba(91,107,160,0.12)",
  indigoDeep: "#3B4A75",
  gold: "#C99A4F",
  goldSoft: "rgba(201,154,79,0.16)",
};

const F_BODY = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function relativeTime(ts: string | null): string | null {
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) return null;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "Active just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `Active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Active ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Active ${day} day${day === 1 ? "" : "s"} ago`;
  const week = Math.floor(day / 7);
  if (week < 4) return `Active ${week} week${week === 1 ? "" : "s"} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `Active ${mo} month${mo === 1 ? "" : "s"} ago`;
  return "Active over a year ago";
}

export function MetricsRibbon({ talentProfileId }: { talentProfileId: string }) {
  const [metrics, setMetrics] = useState<TalentMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getTalentMetrics({ talent_profile_id: talentProfileId }).then((res) => {
      if (res.ok) setMetrics(res.metrics);
      setLoading(false);
    });
  }, [talentProfileId]);

  if (loading || !metrics) return null;

  const activity = relativeTime(metrics.last_active_at);
  const isNew =
    !metrics.last_active_at &&
    metrics.total_completed_bookings === 0 &&
    metrics.verified_skill_count === 0 &&
    metrics.verified_badge_count === 0;

  // For brand-new talent, show a soft welcome instead of hollow zeros.
  if (isNew) {
    return (
      <div
        style={{
          padding: "10px 14px",
          marginBottom: 12,
          borderRadius: 10,
          background: T.indigoSoft,
          border: `1px solid rgba(91,107,160,0.18)`,
          fontFamily: F_BODY,
          fontSize: 12,
          color: T.indigoDeep,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14 }}>✨</span>
        <span>New here — activity and booking history will appear once they complete their first booking.</span>
      </div>
    );
  }

  const pieces: Array<{ icon: string; label: string; tone?: "accent" | "gold" | "neutral" }> = [];

  if (activity) {
    pieces.push({ icon: "⚡", label: activity, tone: "neutral" });
  }
  if (metrics.total_completed_bookings > 0) {
    pieces.push({
      icon: "📅",
      label: `${metrics.total_completed_bookings} booking${metrics.total_completed_bookings === 1 ? "" : "s"} completed`,
      tone: "accent",
    });
  }
  if (metrics.verified_skill_count > 0) {
    pieces.push({
      icon: "✓",
      label: `${metrics.verified_skill_count} skill${metrics.verified_skill_count === 1 ? "" : "s"} verified`,
      tone: "accent",
    });
  }
  if (metrics.verified_badge_count > 0) {
    pieces.push({
      icon: "🛡",
      label: `${metrics.verified_badge_count} trust badge${metrics.verified_badge_count === 1 ? "" : "s"}`,
      tone: "gold",
    });
  }
  if (
    metrics.profile_completeness_pct !== null &&
    metrics.profile_completeness_pct < 100
  ) {
    pieces.push({
      icon: "📊",
      label: `${metrics.profile_completeness_pct}% complete`,
      tone: "neutral",
    });
  }

  if (pieces.length === 0) return null;

  return (
    <div
      style={{
        padding: "10px 14px",
        marginBottom: 12,
        borderRadius: 10,
        background: T.surfaceWarm,
        border: `1px solid ${T.border}`,
        fontFamily: F_BODY,
        fontSize: 12,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: T.inkMuted,
          textTransform: "uppercase",
          marginRight: 8,
        }}
      >
        Earned
      </span>
      {pieces.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: T.inkMuted, opacity: 0.4 }}>·</span>}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 600,
              background:
                p.tone === "accent"
                  ? T.accentSoft
                  : p.tone === "gold"
                    ? T.goldSoft
                    : T.surface,
              color:
                p.tone === "accent"
                  ? T.accent
                  : p.tone === "gold"
                    ? "#7a5a1f"
                    : T.ink,
              border:
                p.tone === "neutral" ? `1px solid ${T.border}` : "none",
            }}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
