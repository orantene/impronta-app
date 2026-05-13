"use client";

import type { CSSProperties } from "react";
import { STATUS_TONES, type StatusTone } from "./status-tones";

/**
 * G.12 — Canonical talent workflow_status chip.
 *
 * Visualises `talent_profiles.workflow_status` consistently across every
 * surface that surfaces a talent (roster, inbox, pitch, share). One
 * vocabulary, one tone palette, one label set.
 *
 * Workflow status values (per migration history):
 *   - draft        — staff-created, not yet ready
 *   - claimed      — talent has a user account but profile still draft
 *   - review       — submitted for agency review
 *   - approved     — vetted by the agency, visible on agency surfaces
 *   - published    — public-visible (directory + share + storefront)
 *   - rejected     — agency declined
 *   - archived     — was published, now off-roster
 *
 * The "claimed" tier is talent-claimed-but-not-yet-published. The agency
 * surface shows it differently than a stale draft because there's a real
 * human attached.
 */
export type TalentWorkflowStatus =
  | "draft"
  | "claimed"
  | "review"
  | "approved"
  | "published"
  | "rejected"
  | "archived"
  | string;

type StatusMeta = {
  tone: StatusTone;
  label: string;
  /** Optional micro-explainer for tooltip. */
  hint: string;
};

const STATUS_META: Record<string, StatusMeta> = {
  draft: {
    tone: "neutral",
    label: "Draft",
    hint: "Profile in progress — not visible to clients.",
  },
  claimed: {
    tone: "info",
    label: "Claimed",
    hint: "Talent claimed their profile but it isn't fully published yet.",
  },
  review: {
    tone: "warning",
    label: "In review",
    hint: "Submitted for agency review.",
  },
  approved: {
    tone: "accent",
    label: "Approved",
    hint: "Vetted by the agency — visible to clients on agency surfaces.",
  },
  published: {
    tone: "success",
    label: "Published",
    hint: "Live on the public directory and storefront.",
  },
  rejected: {
    tone: "danger",
    label: "Declined",
    hint: "Agency declined this profile.",
  },
  archived: {
    tone: "neutral",
    label: "Archived",
    hint: "Off the active roster.",
  },
};

const FALLBACK_META: StatusMeta = {
  tone: "neutral",
  label: "Status",
  hint: "Unknown workflow state.",
};

export function getTalentStatusMeta(status: TalentWorkflowStatus | null | undefined): StatusMeta {
  if (!status) return FALLBACK_META;
  return STATUS_META[status] ?? { ...FALLBACK_META, label: status };
}

export type TalentStatusChipProps = {
  status: TalentWorkflowStatus | null | undefined;
  /** Compact pill — dot + status label only, no padding. */
  compact?: boolean;
  /** Hide the leading dot. */
  withDot?: boolean;
  style?: CSSProperties;
};

export function TalentStatusChip({
  status,
  compact = false,
  withDot = true,
  style,
}: TalentStatusChipProps) {
  const meta = getTalentStatusMeta(status);
  const tone = STATUS_TONES[meta.tone];

  return (
    <span
      title={meta.hint}
      aria-label={`Status: ${meta.label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: compact ? "2px 7px" : "3px 9px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        fontSize: compact ? 10.5 : 11.5,
        fontWeight: 600,
        fontFamily: '"Inter", system-ui, sans-serif',
        letterSpacing: 0.1,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {withDot ? (
        <span
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: tone.fg,
            flexShrink: 0,
          }}
        />
      ) : null}
      {meta.label}
    </span>
  );
}
