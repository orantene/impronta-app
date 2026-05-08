"use client";

// ============================================================================
// _skill-proficiency.tsx — ProficiencyDotPicker + ProficiencyLabel.
//
// Extracted from the original _skill-slot-panel.tsx during the Phase 2
// refactor. Both components are public — re-exported by _skill-slot-panel
// for backwards compatibility.
// ============================================================================

import { useState } from "react";

import {
  PROFICIENCY_LEVELS,
  PROFICIENCY_META,
  type ProficiencyLevel,
} from "@/lib/server-actions/admin-talent-skills.types";

import { F_BODY, T } from "./_skill-tokens";

// ─── ProficiencyDotPicker — interactive 5-dot picker ───────────────────────

export function ProficiencyDotPicker({
  value,
  onChange,
  size = "md",
  readOnly = false,
}: {
  value: ProficiencyLevel | null;
  onChange?: (next: ProficiencyLevel | null) => void;
  size?: "sm" | "md";
  readOnly?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const dotSize = size === "sm" ? 8 : 10;
  const gap = size === "sm" ? 3 : 4;
  const valueDots = value ? PROFICIENCY_META[value].dots : 0;

  const dotColor = (_i: number, isFilled: boolean) => {
    if (!isFilled) return "rgba(11,11,13,0.15)";
    // Color by tier — gold for master, green for expert/advanced, indigo lower
    if (valueDots === 5) return T.gold;
    if (valueDots === 4) return T.accent;
    if (valueDots === 3) return T.indigoDeep;
    if (valueDots === 2) return T.indigo;
    return T.inkMuted;
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        cursor: readOnly ? "default" : "pointer",
      }}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const isFilled = hovered !== null ? i <= hovered : i <= valueDots;
        return (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHovered(i)}
            onClick={() => {
              if (readOnly) return;
              const newLevel = PROFICIENCY_LEVELS[i - 1];
              // Click same dot again → unset
              if (value && PROFICIENCY_META[value].dots === i) {
                onChange?.(null);
              } else {
                onChange?.(newLevel);
              }
            }}
            style={{
              width: dotSize + 4,
              height: dotSize + 4,
              padding: 0,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              cursor: readOnly ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title={
              readOnly
                ? PROFICIENCY_META[PROFICIENCY_LEVELS[i - 1]].label
                : `Set ${PROFICIENCY_META[PROFICIENCY_LEVELS[i - 1]].label} · ${PROFICIENCY_META[PROFICIENCY_LEVELS[i - 1]].description}`
            }
          >
            <span
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: dotColor(i, isFilled),
                transition: "background 0.15s",
              }}
            />
          </button>
        );
      })}
      {hovered !== null && !readOnly && (
        <span
          style={{
            marginLeft: 6,
            fontSize: 10.5,
            color: T.inkMuted,
            fontFamily: F_BODY,
          }}
        >
          {PROFICIENCY_META[PROFICIENCY_LEVELS[hovered - 1]].label}
        </span>
      )}
      {/* Q4: Unrated nudge — when proficiency_level is NULL and no hover,
          gently point users at the gesture. Hides on hover/click. */}
      {hovered === null && !readOnly && value === null && (
        <span
          style={{
            marginLeft: 6,
            fontSize: 10.5,
            color: T.indigoDeep,
            fontFamily: F_BODY,
            fontStyle: "italic",
          }}
        >
          ← tap a dot to set level
        </span>
      )}
    </div>
  );
}

// ─── ProficiencyLabel — non-interactive display version ────────────────────

export function ProficiencyLabel({
  level,
  isVerified,
}: {
  level: ProficiencyLevel | null;
  isVerified: boolean;
}) {
  if (!level) {
    return (
      <span
        style={{
          fontSize: 10.5,
          padding: "2px 8px",
          borderRadius: 999,
          background: T.surfaceAlt,
          color: T.inkMuted,
          fontFamily: F_BODY,
        }}
      >
        Unrated
      </span>
    );
  }
  const meta = PROFICIENCY_META[level];
  const isHigh = level === "master" || level === "expert";
  const showHighWithoutVerification = isHigh && !isVerified;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10.5,
        padding: "2px 8px",
        borderRadius: 999,
        background:
          level === "master"
            ? T.goldSoft
            : level === "expert"
              ? T.accentSoft
              : level === "advanced"
                ? T.indigoSoft
                : T.surfaceAlt,
        color:
          level === "master"
            ? "#7a5a1f"
            : level === "expert"
              ? T.accent
              : level === "advanced"
                ? T.indigoDeep
                : T.inkMuted,
        fontFamily: F_BODY,
      }}
    >
      {meta.label}
      {showHighWithoutVerification && (
        <span style={{ fontSize: 9, opacity: 0.7 }}>(unverified)</span>
      )}
      {isVerified && <span style={{ fontWeight: 700 }}>✓</span>}
    </span>
  );
}
