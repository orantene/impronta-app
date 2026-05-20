"use client";

// ─── PageSkeleton ────────────────────────────────────────────────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { COLORS } from "../state";
import { Skeleton } from "./interactions";

// ─── PageSkeleton (#25) ───────────────────────────────────────────────
// Full-page skeleton shown while real data is loading. Three shimmer
// rows mimic a card list layout.

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading…" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 0",
            borderTop: i > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
          }}
        >
          <Skeleton width={36} height={36} radius={18} />
          <div className="flex-1">
            <Skeleton height={13} width="60%" style={{ marginBottom: 6 }} />
            <Skeleton height={11} width="40%" />
          </div>
          <Skeleton height={22} width={70} radius={999} />
        </div>
      ))}
    </div>
  );
}

