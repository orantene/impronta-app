"use client";

// ============================================================================
// _skill-hints-banner.tsx — Booking-history proficiency hints (Phase 6.3)
//
// Surfaces a dismissible hint card for each skill where the talent's
// accumulated booking count meaningfully exceeds their declared proficiency.
//
// Threshold table (from spec):
//   beginner or null  → suggest bump when booking_count >= 1
//   intermediate      → suggest bump when booking_count >= 5
//   advanced          → suggest bump when booking_count >= 15
//   expert            → suggest bump when booking_count >= 30
//   master            → (never — top tier)
//
// Dismiss is per-session client state (no new DB table needed).
// "Yes, bump" calls updateSkill from admin-talent-skills.ts.
// ============================================================================

import React, { useEffect, useState, useTransition } from "react";
import { getResolvedSkills, updateSkill } from "@/lib/server-actions/admin-talent-skills";
import type { ResolvedSkill, ProficiencyLevel } from "@/lib/server-actions/admin-talent-skills.types";

// ─── Style tokens — matches neutral palette from _skill-overrides-panel ──────

const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  inkDim: "rgba(11,11,13,0.38)",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2EB",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  errorRed: "#C82828",
  errorRedSoft: "rgba(200,40,40,0.08)",
};

const F = "Inter, system-ui, sans-serif";

// ─── Proficiency ladder ────────────────────────────────────────────────────

const TIER_ORDER: ProficiencyLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
  "master",
];

const TIER_LABEL: Record<ProficiencyLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
  master: "Master",
};

/** Booking count threshold at which a bump is suggested for current tier. */
const BUMP_THRESHOLD: Record<ProficiencyLevel | "null", number | null> = {
  null: 1,
  beginner: 1,
  intermediate: 5,
  advanced: 15,
  expert: 30,
  master: null, // top tier — never suggest
};

// ─── Derived hint ─────────────────────────────────────────────────────────

type SkillHint = {
  skill: ResolvedSkill;
  nextTier: ProficiencyLevel;
};

function computeHints(skills: ResolvedSkill[]): SkillHint[] {
  const hints: SkillHint[] = [];

  for (const skill of skills) {
    const current = skill.proficiency_level ?? null;
    const threshold = current === null
      ? BUMP_THRESHOLD["null"]
      : BUMP_THRESHOLD[current];

    // null threshold = master tier or no rule → skip
    if (threshold === null) continue;

    if (skill.booking_count < threshold) continue;

    // Determine next tier up.
    const currentIndex = current === null ? -1 : TIER_ORDER.indexOf(current);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= TIER_ORDER.length) continue; // already master

    hints.push({ skill, nextTier: TIER_ORDER[nextIndex] });
  }

  return hints;
}

// ─── HintCard ─────────────────────────────────────────────────────────────

function HintCard({
  hint,
  talentProfileId,
  onDismiss,
  onBumped,
}: {
  hint: SkillHint;
  talentProfileId: string;
  onDismiss: () => void;
  onBumped: () => void;
}) {
  const { skill, nextTier } = hint;
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [, startTransition] = useTransition();

  function handleBump() {
    setStatus("saving");
    startTransition(async () => {
      const result = await updateSkill({
        talent_profile_id: talentProfileId,
        talent_type_term_id: skill.skill_term_id,
        proficiency_level: nextTier,
      });
      if (result.ok) {
        setStatus("done");
        // Let the "Saved" flash settle before removing the card.
        setTimeout(onBumped, 900);
      } else {
        setStatus("error");
      }
    });
  }

  const skillName = skill.skill_name_en || skill.skill_slug;
  const bookings = skill.booking_count;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 9,
        background: T.surface,
        border: `1px solid ${T.border}`,
      }}
    >
      {/* Left: hint text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: F,
            fontSize: 12.5,
            color: T.ink,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          {bookings} booking{bookings !== 1 ? "s" : ""} as {skillName}.{" "}
          <span style={{ color: T.inkMuted }}>
            Want to update to {TIER_LABEL[nextTier]}?
          </span>
        </span>
        {status === "error" && (
          <div
            style={{
              marginTop: 4,
              fontFamily: F,
              fontSize: 11,
              color: T.errorRed,
            }}
          >
            Couldn&apos;t save — try again.
          </div>
        )}
      </div>

      {/* Right: action buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        {status === "done" ? (
          <span
            style={{
              fontFamily: F,
              fontSize: 11,
              fontWeight: 600,
              color: T.accent,
              background: T.accentSoft,
              padding: "3px 8px",
              borderRadius: 999,
            }}
          >
            Saved
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={status === "saving"}
              onClick={handleBump}
              style={{
                padding: "4px 10px",
                borderRadius: 7,
                border: `1px solid ${T.accent}`,
                background: T.accentSoft,
                color: T.accent,
                fontFamily: F,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: status === "saving" ? "not-allowed" : "pointer",
                opacity: status === "saving" ? 0.6 : 1,
                whiteSpace: "nowrap",
                transition: "opacity 0.15s",
              }}
            >
              {status === "saving" ? "Saving…" : `Bump to ${TIER_LABEL[nextTier]}`}
            </button>
            <button
              type="button"
              disabled={status === "saving"}
              onClick={onDismiss}
              style={{
                padding: "4px 8px",
                borderRadius: 7,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: T.inkMuted,
                fontFamily: F,
                fontSize: 11.5,
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SkillHintsBanner — exported default ──────────────────────────────────

export default function SkillHintsBanner({
  talentProfileId,
  viewMode,
}: {
  talentProfileId: string;
  /** Show hints when viewer is admin OR talent themselves. */
  viewMode: "admin" | "talent-self";
}) {
  const [hints, setHints] = useState<SkillHint[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getResolvedSkills({
        talent_profile_id: talentProfileId,
      });
      if (cancelled) return;
      if (result.ok) {
        setHints(computeHints(result.skills));
      } else {
        // On error, render nothing — don't block the drawer.
        setHints([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [talentProfileId]);

  function dismissHint(termId: string) {
    setDismissed((prev) => new Set([...prev, termId]));
  }

  function bumpDone(termId: string) {
    // After a successful bump, remove the hint card.
    setDismissed((prev) => new Set([...prev, termId]));
  }

  // Still loading → render nothing (don't reserve space).
  if (hints === null) return null;

  const visible = hints.filter((h) => !dismissed.has(h.skill.skill_term_id));

  // No pending hints → render nothing.
  if (visible.length === 0) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontFamily: F,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: T.inkMuted,
          }}
        >
          Skill level hints
        </div>
        <div
          style={{
            padding: "1px 6px",
            borderRadius: 999,
            background: T.accentSoft,
            color: T.accent,
            fontFamily: F,
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {visible.length}
        </div>
      </div>

      {/* Hint cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((hint) => (
          <HintCard
            key={hint.skill.skill_term_id}
            hint={hint}
            talentProfileId={talentProfileId}
            onDismiss={() => dismissHint(hint.skill.skill_term_id)}
            onBumped={() => bumpDone(hint.skill.skill_term_id)}
          />
        ))}
      </div>
    </div>
  );
}
