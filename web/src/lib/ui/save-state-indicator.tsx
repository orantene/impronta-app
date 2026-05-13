"use client";

import { useEffect, useState } from "react";

/**
 * C.7 — Reusable SaveStateIndicator.
 *
 * One canonical chip for "is this form / drawer saved?" state across every
 * autosaving surface. Five states drive its appearance and copy:
 *
 *   - "idle"    nothing happening; no chip rendered
 *   - "dirty"   user changed something; not saved yet
 *   - "saving"  request in flight
 *   - "saved"   last save succeeded (auto-fades to "idle" after 1.6s)
 *   - "error"   last save failed
 *
 * Accessibility: aria-live=polite so screen readers announce transitions
 * without interrupting. Saved → idle decay is internal so consumers can
 * call setState("saved") once and forget.
 */
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type SaveStateIndicatorProps = {
  state: SaveState;
  /** Optional explicit copy override per state. */
  label?: Partial<Record<SaveState, string>>;
  /** Action to retry on error — renders an inline button when present. */
  onRetry?: () => void;
  /** Compact mode hides text and shows only the dot. */
  compact?: boolean;
};

const DEFAULT_LABELS: Record<SaveState, string> = {
  idle: "",
  dirty: "Unsaved",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save",
};

const COLORS: Record<SaveState, { fg: string; bg: string; dot: string }> = {
  idle:   { fg: "transparent", bg: "transparent", dot: "transparent" },
  dirty:  { fg: "#92400E", bg: "rgba(146,64,14,0.10)", dot: "#92400E" },
  saving: { fg: "rgba(11,11,13,0.62)", bg: "rgba(11,11,13,0.04)", dot: "#1D4ED8" },
  saved:  { fg: "#15803D", bg: "rgba(21,128,61,0.10)", dot: "#15803D" },
  error:  { fg: "#A33A3A", bg: "rgba(163,58,58,0.10)", dot: "#A33A3A" },
};

export function SaveStateIndicator({
  state,
  label,
  onRetry,
  compact = false,
}: SaveStateIndicatorProps) {
  // Internal saved → idle auto-fade so consumers can set "saved" once
  // and forget. Each "saved" transition resets the timer.
  const [visibleState, setVisibleState] = useState<SaveState>(state);
  useEffect(() => {
    setVisibleState(state);
    if (state === "saved") {
      const t = setTimeout(() => setVisibleState("idle"), 1600);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (visibleState === "idle") return null;
  const copy = label?.[visibleState] ?? DEFAULT_LABELS[visibleState];
  const color = COLORS[visibleState];

  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 0 : 6,
        padding: compact ? 0 : "4px 9px",
        borderRadius: 999,
        background: compact ? "transparent" : color.bg,
        color: color.fg,
        fontSize: 11.5,
        fontWeight: 500,
        fontFamily: '"Inter", system-ui, sans-serif',
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color.dot,
          flexShrink: 0,
          animation: visibleState === "saving" ? "tulala-pulse 1s ease-in-out infinite" : undefined,
        }}
      />
      {!compact ? copy : null}
      {visibleState === "error" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginLeft: 4,
            background: "transparent",
            border: "none",
            color: color.fg,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          Retry
        </button>
      ) : null}
      <style>{`
        @keyframes tulala-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </span>
  );
}

/**
 * Helper: derive a SaveState from a typical autosave flow's three flags.
 * Many components track (isDirty, isSaving, hasError) separately —
 * collapse them into the canonical state with one call.
 */
export function deriveSaveState(input: {
  isDirty: boolean;
  isSaving: boolean;
  hasError: boolean;
  lastSavedAt?: number | null;
}): SaveState {
  if (input.hasError) return "error";
  if (input.isSaving) return "saving";
  if (input.isDirty) return "dirty";
  // "saved" surfaces briefly after a recent save (last 1.6s) so the
  // chip can confirm success even if the consumer doesn't manually
  // transition to "saved" first.
  if (input.lastSavedAt && Date.now() - input.lastSavedAt < 1600) return "saved";
  return "idle";
}
