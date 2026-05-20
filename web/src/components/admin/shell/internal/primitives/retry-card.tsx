"use client";

// ─── RetryCard ───────────────────────────────────────────────────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { COLORS, FONTS } from "../state";

// ─── RetryCard (#24) ─────────────────────────────────────────────────
// Shown when an async operation fails. Displays an error message +
// a Retry button that calls the provided callback.

export function RetryCard({
  message = "Something went wrong loading this section.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        fontFamily: FONTS.body,
      }}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth={2} strokeLinecap="round">
        <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      <span style={{ flex: 1, fontSize: 13 }} className="text-admin-ink">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "6px 14px",
          background: "transparent",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 7,
          fontFamily: FONTS.body,
          fontSize: 12,
          fontWeight: 600,
          color: COLORS.ink,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

