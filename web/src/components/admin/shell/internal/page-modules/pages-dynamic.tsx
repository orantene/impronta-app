"use client";

import React, { Suspense, lazy, useEffect, useState } from "react";

/**
 * clientOnly — React.lazy-based replacement for next/dynamic({ ssr: false }).
 *
 * PROD INCIDENT (2026-07-23): next/dynamic with ssr:false inside this client
 * shell NEVER invoked its loader on hydration — the SSR bailout template sat
 * unresolved forever, so the Messages shell (talent: blank pane; workspace:
 * skeleton stuck) and the Client/Platform surfaces hung on every fresh build
 * and in production. Instrumentation showed modules evaluating and the shell
 * hydrating, but dynamic()'s loader never firing. React.lazy behind a
 * mounted gate resolves reliably and preserves the exact ssr:false
 * semantics: nothing on the server, load-on-mount on the client.
 */
export function clientOnly<P extends object>(
  // The union absorbs TS's ComponentType<never> branch that `import()`
  // namespace re-exports infer under moduleResolution: bundler.
  load: () => Promise<{ default: React.ComponentType<P> } | { default: React.ComponentType<never> }>,
  Fallback?: React.ComponentType,
): React.ComponentType<P> {
  const LazyInner = lazy(load as () => Promise<{ default: React.ComponentType<P> }>);
  return function ClientOnly(props: P) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return Fallback ? <Fallback /> : null;
    return (
      <Suspense fallback={Fallback ? <Fallback /> : null}>
        <LazyInner {...props} />
      </Suspense>
    );
  };
}

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

export { TalentSurface } from "../talent";
export { ClientSurface } from "../client";
export { PlatformSurface } from "../platform";
export { MessagesShell } from "../messages";
