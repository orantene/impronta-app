"use client";

// ─── StaleDeploymentBanner ───────────────────────────────────────────
//
// A tab left open across a deploy is still running the OLD client bundle.
// Its Server Action calls carry the OLD action id, which the NEW server no
// longer recognizes ("Failed to find Server Action ... This request might
// be from an older or newer deployment" — Next.js E975). Left alone, that
// reads to the admin as a dead-end "couldn't load/save" error with no
// obvious fix; the real fix is just reloading the tab.
//
// Any call site that recognizes that shape via `isStaleDeploymentError()`
// calls `notifyStaleDeployment()`; this banner listens and offers the
// one-click reload. Sibling to `OfflineBanner` (same bottom-left pill,
// same tokens) so the two read as one connectivity-status language, but
// styled `indigo` — the design system's "informational / system
// messaging" role — never red: nothing is broken, a newer version just
// shipped underneath the open tab.
//
// Deliberately does NOT self-detect (no polling, no SW hook) — it is a
// dumb, tested display for an event any call site can raise. Detection
// happens exactly where the error is already caught, so the specific
// failure never masquerades as "backend not implemented" or a
// permissions issue when it was really just a stale tab.

import { useEffect, useState } from "react";
import { useDashboardText } from "./shell/internal/dashboard-i18n";
import { COLORS, FONTS, RADIUS } from "./shell/internal/state";
import { onStaleDeployment } from "@/lib/client/stale-deployment";

export function StaleDeploymentBanner() {
  const copy = useDashboardText();
  const [visible, setVisible] = useState(false);

  useEffect(() => onStaleDeployment(() => setVisible(true)), []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-tulala-stale-deployment-banner
      style={{
        position: "fixed",
        // Same corner as OfflineBanner (bottom-left, never top — the
        // workspace header owns the top of the viewport). The two are
        // mutually exclusive in practice; the +1 z-index just keeps this
        // one on top if they ever did overlap.
        bottom: 20,
        left: 20,
        background: COLORS.fill,
        color: "#fff",
        fontFamily: FONTS.body,
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px 9px 14px",
        borderRadius: RADIUS.md,
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        maxWidth: "calc(100vw - 40px)",
        zIndex: 351,
        animation: "tulala-page-fade .2s ease",
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-stale-deployment-banner] {
            left: 12px !important;
            right: 12px !important;
            bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
            max-width: none !important;
          }
        }
      `}</style>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.indigo, flexShrink: 0 }} />
      <span>{copy.t("A newer version is live. Reload to keep editing.")}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginLeft: 4,
          background: COLORS.indigo,
          border: "none",
          borderRadius: 6,
          color: "#fff",
          fontFamily: FONTS.body,
          fontSize: 12,
          fontWeight: 700,
          padding: "3px 10px",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        {copy.t("Reload")}
      </button>
    </div>
  );
}
