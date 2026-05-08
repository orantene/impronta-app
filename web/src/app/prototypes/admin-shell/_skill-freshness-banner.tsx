"use client";

// ============================================================================
// _skill-freshness-banner.tsx — Skill freshness + verification-expiry
//                               prompts (Phase 6.4)
//
// Two kinds of nudge cards, computed client-side from `talent_skills_resolved`:
//
//   1. Freshness — skill gone stale (not booked in a long time or never):
//      - last_booked_at IS NULL AND created_at < now - 6 months, OR
//      - last_booked_at < now - 12 months
//      Action: "Keep on profile" (session-dismiss) | "Remove skill"
//
//   2. Verification expiry — is_verified AND verified_at < now - 12 months:
//      Action: "Request re-verification" (calls unverifySkill + shows toast)
//
// Dismiss is per-session client state only (no new DB table).
// Renders nothing when there are no pending prompts.
// Visible to admin viewMode AND talent self-view.
// ============================================================================

import React, { useEffect, useState, useTransition } from "react";
import {
  getResolvedSkills,
  removeSkill,
  unverifySkill,
} from "@/lib/server-actions/admin-talent-skills";
import type { ResolvedSkill } from "@/lib/server-actions/admin-talent-skills.types";

// ─── Style tokens — same neutral palette as _skill-overrides-panel ────────────

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
  // Amber/neutral for freshness — not red, not green
  warmBorder: "rgba(24,24,27,0.13)",
  warmBg: "#F9F7F1",
};

const F = "Inter, system-ui, sans-serif";

// ─── Freshness thresholds ────────────────────────────────────────────────────

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 12 * 30 * 24 * 60 * 60 * 1000;

// ─── Prompt types ─────────────────────────────────────────────────────────────

type FreshnessPrompt = {
  kind: "freshness";
  skill: ResolvedSkill;
  reason: "never_booked" | "long_ago";
};

type ExpiryPrompt = {
  kind: "expiry";
  skill: ResolvedSkill;
  verifiedAt: Date;
};

type SkillPrompt = FreshnessPrompt | ExpiryPrompt;

// ─── Compute prompts from resolved skills ─────────────────────────────────────

function computePrompts(skills: ResolvedSkill[]): SkillPrompt[] {
  const now = Date.now();
  const prompts: SkillPrompt[] = [];

  for (const skill of skills) {
    // ── Freshness check ──────────────────────────────────────────────────────
    if (skill.last_booked_at === null) {
      // Never booked: stale if added more than 6 months ago.
      const createdMs = new Date(skill.created_at).getTime();
      if (now - createdMs > SIX_MONTHS_MS) {
        prompts.push({ kind: "freshness", skill, reason: "never_booked" });
      }
    } else {
      // Has been booked: stale if last booking > 12 months ago.
      const lastBookedMs = new Date(skill.last_booked_at).getTime();
      if (now - lastBookedMs > TWELVE_MONTHS_MS) {
        prompts.push({ kind: "freshness", skill, reason: "long_ago" });
      }
    }

    // ── Verification expiry check ────────────────────────────────────────────
    if (skill.is_verified && skill.verified_at !== null) {
      const verifiedMs = new Date(skill.verified_at).getTime();
      if (now - verifiedMs > TWELVE_MONTHS_MS) {
        prompts.push({
          kind: "expiry",
          skill,
          verifiedAt: new Date(skill.verified_at),
        });
      }
    }
  }

  return prompts;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date as "Mon YYYY" (e.g. "Apr 2024"). */
function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ─── Toast — very lightweight inline feedback ─────────────────────────────────

function InlineToast({ message }: { message: string }) {
  return (
    <span
      aria-live="polite"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        background: T.accentSoft,
        color: T.accent,
        fontFamily: F,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.1,
      }}
    >
      {message}
    </span>
  );
}

// ─── FreshnessCard ────────────────────────────────────────────────────────────

function FreshnessCard({
  prompt,
  talentProfileId,
  onDismiss,
  onRemoved,
}: {
  prompt: FreshnessPrompt;
  talentProfileId: string;
  onDismiss: () => void;
  onRemoved: () => void;
}) {
  const { skill, reason } = prompt;
  const skillName = skill.skill_name_en || skill.skill_slug;

  const [status, setStatus] = useState<
    "idle" | "removing" | "removed" | "error"
  >("idle");
  const [, startTransition] = useTransition();

  const message =
    reason === "never_booked"
      ? `You haven't booked ${skillName} in over a year. Still active?`
      : `You haven't booked ${skillName} in over a year. Still active?`;

  function handleRemove() {
    setStatus("removing");
    startTransition(async () => {
      const result = await removeSkill({
        talent_profile_id: talentProfileId,
        talent_type_term_id: skill.skill_term_id,
      });
      if (result.ok) {
        setStatus("removed");
        setTimeout(onRemoved, 700);
      } else {
        setStatus("error");
      }
    });
  }

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
        border: `1px solid ${T.warmBorder}`,
      }}
    >
      {/* Left: message */}
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
          {message}
        </span>
        {status === "error" && (
          <div
            style={{
              marginTop: 4,
              fontFamily: F,
              fontSize: 11,
              color: "#C82828",
            }}
          >
            Couldn't remove — try again.
          </div>
        )}
      </div>

      {/* Right: actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        {status === "removed" ? (
          <InlineToast message="Removed" />
        ) : (
          <>
            {/* Keep on profile = session-dismiss */}
            <button
              type="button"
              disabled={status === "removing"}
              onClick={onDismiss}
              style={{
                padding: "4px 10px",
                borderRadius: 7,
                border: `1px solid ${T.accent}`,
                background: T.accentSoft,
                color: T.accent,
                fontFamily: F,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "opacity 0.15s",
              }}
            >
              Keep on profile
            </button>
            {/* Remove skill */}
            <button
              type="button"
              disabled={status === "removing"}
              onClick={handleRemove}
              style={{
                padding: "4px 8px",
                borderRadius: 7,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: T.inkMuted,
                fontFamily: F,
                fontSize: 11.5,
                fontWeight: 500,
                cursor: status === "removing" ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                opacity: status === "removing" ? 0.6 : 1,
              }}
            >
              {status === "removing" ? "Removing…" : "Remove skill"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ExpiryCard ───────────────────────────────────────────────────────────────

function ExpiryCard({
  prompt,
  talentProfileId,
  onDone,
}: {
  prompt: ExpiryPrompt;
  talentProfileId: string;
  onDone: () => void;
}) {
  const { skill, verifiedAt } = prompt;
  const skillName = skill.skill_name_en || skill.skill_slug;

  const [status, setStatus] = useState<
    "idle" | "requesting" | "done" | "error"
  >("idle");
  const [, startTransition] = useTransition();

  function handleRequest() {
    setStatus("requesting");
    startTransition(async () => {
      const result = await unverifySkill({
        talent_profile_id: talentProfileId,
        talent_type_term_id: skill.skill_term_id,
      });
      if (result.ok) {
        setStatus("done");
        setTimeout(onDone, 1000);
      } else {
        setStatus("error");
      }
    });
  }

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
        border: `1px solid ${T.warmBorder}`,
      }}
    >
      {/* Left: message */}
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
          Your {skillName} verification expired{" "}
          <span style={{ color: T.inkMuted }}>
            (last reviewed {formatMonthYear(verifiedAt)}).
          </span>
        </span>
        {status === "error" && (
          <div
            style={{
              marginTop: 4,
              fontFamily: F,
              fontSize: 11,
              color: "#C82828",
            }}
          >
            Couldn't submit — try again.
          </div>
        )}
        {status === "done" && (
          <div
            style={{
              marginTop: 4,
              fontFamily: F,
              fontSize: 11,
              color: T.inkMuted,
            }}
          >
            Verification cleared. An admin can re-verify when ready.
          </div>
        )}
      </div>

      {/* Right: action */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {status === "done" ? (
          <InlineToast message="Sent" />
        ) : (
          <button
            type="button"
            disabled={status === "requesting"}
            onClick={handleRequest}
            style={{
              padding: "4px 10px",
              borderRadius: 7,
              border: `1px solid ${T.accent}`,
              background: T.accentSoft,
              color: T.accent,
              fontFamily: F,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: status === "requesting" ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              opacity: status === "requesting" ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {status === "requesting"
              ? "Submitting…"
              : "Request re-verification"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── SkillFreshnessBanner — exported default ──────────────────────────────────

export default function SkillFreshnessBanner({
  talentProfileId,
  viewMode,
}: {
  talentProfileId: string;
  /** Shown to admin viewMode AND talent self-view. */
  viewMode: "admin" | "talent-self";
}) {
  const [prompts, setPrompts] = useState<SkillPrompt[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // viewMode is kept for future conditional rendering (e.g. hiding expiry
  // prompts from non-self viewers). Currently both views see all prompts.
  void viewMode;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getResolvedSkills({
        talent_profile_id: talentProfileId,
      });
      if (cancelled) return;
      if (result.ok) {
        setPrompts(computePrompts(result.skills));
      } else {
        // On error, render nothing — don't block the drawer.
        setPrompts([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [talentProfileId]);

  function dismiss(key: string) {
    setDismissed((prev) => new Set([...prev, key]));
  }

  // Still loading → render nothing (don't reserve space).
  if (prompts === null) return null;

  // Build unique key per prompt: `{kind}:{term_id}`.
  const visible = prompts.filter(
    (p) => !dismissed.has(`${p.kind}:${p.skill.skill_term_id}`),
  );

  // No pending prompts → render nothing.
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
          Skill check-ins
        </div>
        <div
          style={{
            padding: "1px 6px",
            borderRadius: 999,
            background: T.surfaceAlt,
            color: T.inkMuted,
            fontFamily: F,
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {visible.length}
        </div>
      </div>

      {/* Prompt cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((prompt) => {
          const key = `${prompt.kind}:${prompt.skill.skill_term_id}`;
          if (prompt.kind === "freshness") {
            return (
              <FreshnessCard
                key={key}
                prompt={prompt}
                talentProfileId={talentProfileId}
                onDismiss={() => dismiss(key)}
                onRemoved={() => dismiss(key)}
              />
            );
          }
          return (
            <ExpiryCard
              key={key}
              prompt={prompt}
              talentProfileId={talentProfileId}
              onDone={() => dismiss(key)}
            />
          );
        })}
      </div>
    </div>
  );
}
