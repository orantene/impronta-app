"use client";

/**
 * WhereUsedConfirm (D6) — the where-used / impact preview confirm shown BEFORE a
 * one-way hide or archive.
 *
 * It surfaces the two complementary already-shipped read signals (composed by the
 * `loadHideImpact` server action):
 *
 *   - D1 LIVE-PAGE USAGE — "used on N live pages; they keep their copy but it
 *     leaves the gallery".
 *   - G5 TEMPLATE DEPENDENTS — "N other templates embed it".
 *
 * Lifecycle the caller drives:
 *   1. Operator clicks Archive/Hide → caller calls `loadHideImpact(ref)` and, on
 *      success, opens this dialog with the returned `impact`.
 *   2. While the impact is loading the caller passes `impact={null}` +
 *      `loading` so the dialog shows a "checking where this is used…" state (the
 *      confirm is still reachable but the destructive action is disabled).
 *   3. Operator confirms → caller runs the actual archive/hide action; cancel
 *      closes the dialog.
 *
 * PRESENTATIONAL — it never loads the impact itself or runs the destructive
 * action; the caller wires both. Reuses the Lab `ui.tsx` primitives + LAB tokens
 * so it matches every other Lab surface (no gold/rust). This file is exported so
 * a follow-up can wire it into the catalog (code-row) archive path without a
 * collision; the Template Manager archive flow wires it directly.
 */

import { LAB, RADII, LabButton, LabBadge } from "./ui";
import type { HideImpact } from "@/lib/site-admin/builder-core/templates/hide-impact";

export interface WhereUsedConfirmProps {
  /** Open/closed — when false nothing renders. */
  open: boolean;
  /** What is being hidden/archived (rendered in the heading), e.g. a row title. */
  subjectLabel: string;
  /** Which verb the confirm gates (affects the CTA label + copy). */
  action?: "hide" | "archive";
  /** The composed impact from `loadHideImpact`; null while it is still loading. */
  impact: HideImpact | null;
  /** True while `loadHideImpact` is in flight (shows a checking state). */
  loading?: boolean;
  /** True while the destructive action itself is running (after confirm). */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** One labelled count chip ("N live pages" / "N templates"). */
function CountStat({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "8px 12px",
        background: LAB.cardSoft,
        border: `1px solid ${LAB.borderSoft}`,
        borderRadius: RADII.control,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: value > 0 ? LAB.ink : LAB.inkDim,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 10.5, color: LAB.inkMuted, lineHeight: 1.3 }}>
        {label}
      </span>
    </div>
  );
}

export function WhereUsedConfirm({
  open,
  subjectLabel,
  action = "archive",
  impact,
  loading,
  busy,
  onConfirm,
  onCancel,
}: WhereUsedConfirmProps) {
  if (!open) return null;

  const verbTitle = action === "hide" ? "Hide" : "Archive";
  const loadBearing = impact?.loadBearing ?? false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${verbTitle} ${subjectLabel}`}
      data-testid="where-used-confirm"
      style={{
        marginTop: 10,
        padding: 14,
        background: LAB.card,
        border: `1px solid ${loadBearing ? LAB.red : LAB.border}`,
        borderRadius: RADII.card,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: LAB.ink }}>
          {verbTitle} “{subjectLabel}”?
        </span>
        {loadBearing ? (
          <LabBadge tone="custom" bg={LAB.redBg} fg={LAB.red}>
            Load-bearing
          </LabBadge>
        ) : null}
      </div>

      {/* Counts row — only once the impact has resolved. */}
      {impact ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CountStat value={impact.usageCount} label="live pages use it" />
          <CountStat
            value={impact.dependentCount}
            label="other templates embed it"
          />
        </div>
      ) : null}

      {/* Human-readable message / loading state. */}
      <p
        style={{
          fontSize: 12.5,
          color: LAB.inkMuted,
          lineHeight: 1.55,
          margin: 0,
          maxWidth: 540,
        }}
      >
        {loading || !impact
          ? "Checking where this is used…"
          : impact.message}
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <LabButton
          variant="secondary"
          onClick={onCancel}
          disabled={busy}
          testId="where-used-cancel"
        >
          Keep in gallery
        </LabButton>
        <LabButton
          variant="primary"
          onClick={onConfirm}
          disabled={loading || busy || !impact}
          testId="where-used-confirm-go"
          style={
            loadBearing
              ? { background: LAB.red, color: "#0F0F11" }
              : undefined
          }
        >
          {busy ? `${verbTitle.slice(0, -1)}ing…` : `${verbTitle} anyway`}
        </LabButton>
      </div>
    </div>
  );
}
