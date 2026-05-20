"use client";

// ─── WS-6.6 StaleDataPill primitive + hook ───────────────────────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useCallback, useEffect, useState } from "react";
import { COLORS, FONTS } from "../state";

export type StaleInfo = { stale: boolean; by: string; at: Date };

/** Simulates a remote update from another user (prototype-only). */
export function useStaleDetection(
  surfaceId: string,
  intervalMs = 20_000,
): { stale: boolean; staleMeta: StaleInfo | null; touch: () => void; dismiss: () => void } {
  const NAMES = ["Marco", "Sofia", "Lena", "Nico", "Ana"];
  const [staleMeta, setStaleMeta] = useState<StaleInfo | null>(null);

  // Simulate a remote update after intervalMs
  useEffect(() => {
    const tid = setTimeout(() => {
      const by = NAMES[Math.floor(Math.random() * NAMES.length)];
      setStaleMeta({ stale: true, by, at: new Date() });
    }, intervalMs);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- NAMES is a constant array defined inline (same values every render); setStaleMeta is a stable setter
  }, [surfaceId, intervalMs]);

  const touch   = useCallback(() => setStaleMeta(null), []);
  const dismiss = useCallback(() => setStaleMeta(null), []);

  return { stale: !!staleMeta?.stale, staleMeta, touch, dismiss };
}

export function StaleDataPill({
  stale,
  by,
  onRefresh,
  onDismiss,
}: {
  stale:     boolean;
  by?:       string;
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (stale) setVisible(true);
  }, [stale]);

  if (!visible) return null;

  return (
    <div
      data-tulala-stale-pill
      role="status"
      aria-live="polite"
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          6,
        background:   COLORS.surfaceAlt,
        border:       `1px solid ${COLORS.border}`,
        borderRadius: 999,
        padding:      "4px 10px 4px 8px",
        fontSize:     12,
        color:        COLORS.ink,
        fontFamily:   FONTS.body,
        boxShadow:    "0 2px 8px rgba(0,0,0,0.08)",
        animation:    "tulalaStaleIn .25s ease",
      }}
    >
      <style>{`@keyframes tulalaStaleIn { from { opacity:0; transform: translateY(-4px); } to { opacity:1; transform: translateY(0); } }`}</style>
      <span className="text-admin-13">↑</span>
      <span>
        {by ? <strong>{by}</strong> : "Someone"} made changes
        {" — "}
        <button
          type="button"
          onClick={() => { setVisible(false); onRefresh(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: COLORS.accent, fontWeight: 700, fontSize: 12,
            fontFamily: FONTS.body, padding: 0, textDecoration: "underline",
          }}
        >
          refresh ↻
        </button>
      </span>
      <button
        type="button"
        aria-label="Dismiss stale notice"
        onClick={() => { setVisible(false); onDismiss(); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: COLORS.inkMuted, fontSize: 14, lineHeight: 1,
          marginLeft: 4, padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.8  Conflict-resolution dialog — two users edit; show diff; pick winner
// ─────────────────────────────────────────────────────────────────────────────
//
//  data-tulala-conflict-dialog   — the modal wrapper
//
// Usage:
//   <ConflictDialog
//     open={hasConflict}
//     field="Description"
//     yourValue="Available weekends only"
//     theirValue="Available Mon–Fri, 9am–6pm"
//     theirAuthor="Marco"
//     onKeepMine={() => resolve("mine")}
//     onKeepTheirs={() => resolve("theirs")}
//     onClose={() => setConflict(false)}
//   />

