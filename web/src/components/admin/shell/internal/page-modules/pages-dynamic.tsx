"use client";

import dynamic from "next/dynamic";

/**
 * pages-dynamic.tsx — the shell's two heaviest subtrees, loaded on demand.
 *
 * HISTORY, BECAUSE IT MATTERS HERE. On 2026-07-23 (#874) every async edge
 * into this graph — `next/dynamic({ ssr: false })` and `React.lazy` alike —
 * was made STATIC after a production incident: under webpack those edges
 * formed a cross-chunk cycle that deadlocked module resolution on fresh
 * builds, and both messaging surfaces hung forever. The file kept its name
 * and a `clientOnly` helper nobody called.
 *
 * WHY IT IS DYNAMIC AGAIN, AND HOW THIS DIFFERS. The build is Turbopack
 * now, and `admin/pos/mode-clients.tsx` has been shipping five `next/dynamic`
 * boundaries into this same client graph since the bundle budget went red
 * the first time. Two things about THIS shape are different from the one
 * that failed:
 *   1. `ssr` stays ON. The server renders the messages shell / the talent
 *      surface into the HTML and the client hydrates it once the chunk
 *      arrives — nothing waits on a loader that never fires.
 *   2. The edges point one way, and there is ONE of them. `MessagesShell`,
 *      `TalentSurface` and the drawer switch import the eager shell (state,
 *      primitives, i18n); the eager shell reaches them only through
 *      `../shell-lazy-surfaces`, the single `import()` target (that file
 *      says why one target and not three). The setter that pages call
 *      before navigating into messages lives in
 *      `messages/conversation-pending.ts`, a leaf, so no page module
 *      imports the messages barrel any more.
 *
 * WHY. Every admin route shares one client graph, and the register on a
 * tablet was downloading the talent surface and the messages machinery it
 * can never render. `scripts/app-bundle-budget.mjs` measures exactly that
 * union; these two boundaries are the largest cuts in it. The 2026-09-11
 * commit that made them records what was measured and which journey was
 * walked on the production build; CI's `perf:app-budget` is the gate.
 */

export const MessagesShell = dynamic(
  () => import("../shell-lazy-surfaces").then((m) => ({ default: m.MessagesShell })),
  { loading: MessagesShellSkeleton },
);

export const TalentSurface = dynamic(
  () => import("../shell-lazy-surfaces").then((m) => ({ default: m.TalentSurface })),
  { loading: () => null },
);

// ─── Messages shell skeleton ──────────────────────────────────────────────────
// Shown while the dynamic MessagesShell bundle is being fetched/hydrated.
// Mirrors the two-pane layout (340 px inbox rail + thread pane) so the page
// feels structurally stable instead of blank-white for the 6-10 s cold load.
function MessagesShellSkeleton() {
  return (
    <div
      aria-label="Loading messages…"
      aria-busy="true"
      style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        background: "#fff",
        border: "1px solid rgba(24,24,27,0.08)",
        borderRadius: 14,
        overflow: "hidden",
        height: "min(calc(100vh - 50px - 56px - 200px), 820px)",
        minHeight: 560,
        minWidth: 0,
        maxWidth: "100%",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      {/* Left pane — inbox skeleton */}
      <div style={{ borderRight: "1px solid rgba(24,24,27,0.08)", display: "flex", flexDirection: "column" }}>
        {/* Search bar placeholder */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(24,24,27,0.08)" }}>
          <div style={{ height: 34, borderRadius: 8, background: "rgba(11,11,13,0.06)", animation: "shimmer 1.4s ease-in-out infinite" }} />
        </div>
        {/* Filter chips placeholder */}
        <div style={{ padding: "10px 14px", display: "flex", gap: 6, borderBottom: "1px solid rgba(24,24,27,0.08)" }}>
          {[60, 40, 56, 48].map((w, i) => (
            <div key={i} style={{ height: 26, width: w, borderRadius: 999, background: i === 0 ? "rgba(15,79,62,0.12)" : "rgba(11,11,13,0.05)", animation: "shimmer 1.4s ease-in-out infinite" }} />
          ))}
        </div>
        {/* Row skeletons */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ padding: "12px 14px", borderBottom: "1px solid rgba(24,24,27,0.06)", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(11,11,13,0.07)", flexShrink: 0, animation: "shimmer 1.4s ease-in-out infinite" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ height: 13, borderRadius: 4, background: "rgba(11,11,13,0.08)", width: `${70 + (i % 3) * 10}%`, animation: "shimmer 1.4s ease-in-out infinite" }} />
              <div style={{ height: 11, borderRadius: 4, background: "rgba(11,11,13,0.05)", width: `${50 + (i % 4) * 8}%`, animation: "shimmer 1.4s ease-in-out infinite" }} />
              <div style={{ height: 10, borderRadius: 4, background: "rgba(11,11,13,0.04)", width: `${60 + (i % 2) * 12}%`, animation: "shimmer 1.4s ease-in-out infinite" }} />
            </div>
          </div>
        ))}
      </div>
      {/* Right pane — thread skeleton */}
      <div style={{ background: "rgba(11,11,13,0.025)", display: "flex", flexDirection: "column", padding: 16, gap: 12 }}>
        {/* Header band */}
        <div style={{ height: 52, borderRadius: 10, background: "rgba(11,11,13,0.06)", animation: "shimmer 1.4s ease-in-out infinite" }} />
        {/* Tab bar */}
        <div style={{ height: 36, borderRadius: 8, background: "rgba(11,11,13,0.05)", animation: "shimmer 1.4s ease-in-out infinite" }} />
        {/* Message bubbles */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          {[{ w: "55%", side: "left" }, { w: "40%", side: "right" }, { w: "65%", side: "left" }, { w: "35%", side: "right" }].map((b, i) => (
            <div key={i} style={{ display: "flex", justifyContent: b.side === "right" ? "flex-end" : "flex-start" }}>
              <div style={{ height: 38, width: b.w, borderRadius: 12, background: b.side === "right" ? "rgba(15,79,62,0.10)" : "rgba(11,11,13,0.07)", animation: "shimmer 1.4s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
        {/* Composer */}
        <div style={{ height: 52, borderRadius: 10, background: "rgba(11,11,13,0.06)", animation: "shimmer 1.4s ease-in-out infinite" }} />
      </div>
      <style>{`
        @keyframes shimmer {
          0%   { opacity: 1; }
          50%  { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
