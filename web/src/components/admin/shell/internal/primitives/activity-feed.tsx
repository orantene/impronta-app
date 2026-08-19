"use client";

// ─── ActivityFeed (and ActivityFeedItem) ─────────────────────────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useState } from "react";
import { COLORS, FONTS } from "../state";
import { Icon } from "./icons";

/** Shared by the <time> and plain-<div> timestamp branches so they cannot drift. */
const TIMESTAMP_STYLE = {
  fontSize: 11,
  flexShrink: 0,
  marginTop: 1,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
} as const;

// ─── ActivityFeedItem (#32) ───────────────────────────────────────────
// A single event in a workspace-level or talent-level activity feed.

export function ActivityFeedItem({
  actor,
  action,
  target,
  timestamp,
  iso,
  icon,
  iconName,
}: {
  actor: string;
  action: string;
  target: string;
  /** Human label, e.g. "2d ago". */
  timestamp: string;
  /** ISO instant behind `timestamp`. Optional so the drawer / thread call
   *  sites keep working unchanged; when given, the label becomes a real
   *  <time> element carrying the machine-readable instant. */
  iso?: string;
  icon?: string;
  iconName?: "mail" | "check" | "bolt" | "calendar" | "settings" | "user" | "team" | "archive" | "alert";
}) {
  return (
    <div
      className="flex items-start gap-2.5 py-2.5"
      style={{ fontFamily: FONTS.body }}
    >
      <div
        className="bg-admin-surface-alt"
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          border: `1px solid ${COLORS.borderSoft}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 12,
          marginTop: 1,
        }}
        aria-hidden
      >
        {iconName ? <Icon name={iconName} size={12} stroke={1.7} color={COLORS.inkMuted} /> : (icon ?? "📋")}
      </div>

      {/* Sentence — actor and target carry the ink, the verb stays muted so the
          eye lands on who/what, not on the connective tissue. */}
      <div className="flex-1 min-w-0 text-admin-ink-muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
        <span className="font-semibold text-admin-ink">{actor}</span>
        {" "}{action}{" "}
        <span className="font-medium text-admin-ink">{target}</span>
      </div>

      {/* Timestamp rides the same baseline instead of stacking a second line
          under every row — keeps the feed one row = one line. */}
      {iso ? (
        <time dateTime={iso} className="text-admin-ink-muted" style={TIMESTAMP_STYLE}>
          {timestamp}
        </time>
      ) : (
        <div className="text-admin-ink-muted" style={TIMESTAMP_STYLE}>
          {timestamp}
        </div>
      )}
    </div>
  );
}


export type ActivityEntry = {
  id:        string;
  /** Who / what triggered the event. */
  actor:     string;
  /** Short past-tense sentence. */
  action:    string;
  /** ISO date string or relative label. */
  at:        string;
  /** Optional: pill/chip label (stage, status, etc.) */
  badge?:    string;
  badgeTone?: "green" | "amber" | "red" | "blue" | "ink";
  /** Optional secondary body — e.g. a quote or note. */
  detail?:   string;
  /** Optional icon name */
  icon?:     "mail" | "calendar" | "user" | "sparkle" | "info" | "bolt";
};

const BADGE_COLORS: Record<NonNullable<ActivityEntry["badgeTone"]>, { bg: string; color: string }> = {
  green: { bg: "rgba(16,185,129,0.10)", color: "#065F46" },
  amber: { bg: "rgba(245,158,11,0.10)", color: "#92400E" },
  red:   { bg: "rgba(220,38,38,0.10)",  color: "#991B1B" },
  blue:  { bg: "rgba(59,130,246,0.10)", color: "#1E40AF" },
  ink:   { bg: "rgba(11,11,13,0.06)",   color: "#1A1A2E"  },
};

export function ActivityFeed({
  entries,
  maxVisible = 8,
  onSeeAll,
  compact = false,
}: {
  entries:      ActivityEntry[];
  maxVisible?:  number;
  onSeeAll?:    () => void;
  compact?:     boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, maxVisible);
  const hasMore = entries.length > maxVisible && !showAll;

  if (!entries.length) return null;

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 0 : 2 }}>
        {visible.map((entry, idx) => {
          const badgeStyle = entry.badgeTone ? BADGE_COLORS[entry.badgeTone] : BADGE_COLORS.ink;
          return (
            <div
              key={entry.id}
              style={{
                display:       "flex",
                gap:           12,
                padding:       compact ? "8px 0" : "10px 12px",
                borderBottom:  idx < visible.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
                alignItems:    "flex-start",
              }}
            >
              {/* Icon column */}
              <div style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }} className="bg-admin-surface-alt">
                <Icon name={entry.icon ?? "bolt"} size={12} color={COLORS.inkMuted} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 12.5 }} className="text-admin-ink">{entry.actor}</span>
                  <span className="text-admin-ink-muted text-admin-12h">{entry.action}</span>
                  {entry.badge && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700,
                      padding: "1px 6px", borderRadius: 999,
                      background: badgeStyle.bg, color: badgeStyle.color,
                    }}>
                      {entry.badge}
                    </span>
                  )}
                </div>
                {entry.detail && (
                  <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, fontStyle: "italic" }} className="text-admin-ink-muted">
                    &ldquo;{entry.detail}&rdquo;
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <span style={{ fontSize: 11, flexShrink: 0, marginTop: 2 }} className="text-admin-ink-muted">
                {entry.at}
              </span>
            </div>
          );
        })}
      </div>

      {(hasMore || onSeeAll) && (
        <button
          type="button"
          onClick={hasMore ? () => setShowAll(true) : onSeeAll}
          style={{
            marginTop: 8, background: "none", border: "none", cursor: "pointer",
            fontSize: 12, color: COLORS.accent, fontFamily: FONTS.body, fontWeight: 600,
            padding: "4px 0",
          }}
        >
          {hasMore ? `Show ${entries.length - maxVisible} more` : "See full history →"}
        </button>
      )}
    </div>
  );
}
