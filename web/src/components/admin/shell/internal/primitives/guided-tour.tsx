"use client";

// ─── WS-9.7 GuidedTour primitive ─────────────────────────────────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useEffect, useState, type ReactNode } from "react";
import { COLORS, FONTS, RADIUS, TRANSITION } from "../state";
import { PrimaryButton, GhostButton } from "./buttons";

// ─── WS-9.7 GuidedTour primitive ─────────────────────────────────────────────
//
// Spotlight + tooltip step-by-step tour. Dismissible and resumable via
// localStorage. Used for first-run onboarding flows and feature discovery.
//
// Architecture:
//   - <GuidedTour> takes an ordered `steps` array and a `tourId`.
//   - Each step targets a DOM element via a CSS selector (`target`).
//   - A semi-transparent overlay dims the page; the target element
//     is "spotlighted" by cutting a hole in the overlay.
//   - A tooltip floats near the target with title, body, and Prev/Next.
//   - `tourId` is written to localStorage on dismiss/complete so the
//     tour doesn't re-appear on reload.
//
// Usage:
//   <GuidedTour
//     tourId="workspace-v1"
//     steps={[
//       { target: "[data-tulala-app-topbar]", title: "Your topbar", body: "Navigate between pages here." },
//       { target: "[data-tulala-surface-main]", title: "Main area", body: "Your work lives here." },
//     ]}
//     onComplete={() => void improntaLog("admin_primitives.info", { message: "Tour done" })}
//   />
// ─────────────────────────────────────────────────────────────────────────────

export type TourStep = {
  /** CSS selector for the element to spotlight. If null, no spotlight. */
  target: string | null;
  title:  string;
  body:   string;
  /** Optional CTA label + handler inline with Next */
  ctaLabel?: string;
  onCta?:    () => void;
};

const TOUR_SEEN_PREFIX = "tulala-tour-seen-";

export function GuidedTour({
  tourId,
  steps,
  onComplete,
  onDismiss,
}: {
  tourId:      string;
  steps:       TourStep[];
  onComplete?: () => void;
  onDismiss?:  () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem(TOUR_SEEN_PREFIX + tourId); } catch { return false; }
  });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[stepIdx];

  // Find target rect on step change
  useEffect(() => {
    if (!step?.target) { setRect(null); return; }
    const el = document.querySelector(step.target);
    setRect(el?.getBoundingClientRect() ?? null);
  }, [stepIdx, step?.target]);

  const finish = (complete: boolean) => {
    try { localStorage.setItem(TOUR_SEEN_PREFIX + tourId, "1"); } catch {}
    setDismissed(true);
    if (complete) onComplete?.();
    else          onDismiss?.();
  };

  if (dismissed || !step) return null;

  const isLast = stepIdx === steps.length - 1;

  // Tooltip positioning: below the spotlight by default; flip up if near bottom
  const vw = typeof window !== "undefined" ? window.innerWidth  : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const TOOLTIP_W = 280;
  const tipLeft = rect ? Math.min(rect.left, vw - TOOLTIP_W - 16) : (vw - TOOLTIP_W) / 2;
  let tipTop  = rect ? rect.bottom + 12 : vh * 0.42;
  if (rect && rect.bottom + 180 > vh) tipTop = rect.top - 180 - 12;

  return (
    <div
      data-tulala-guided-tour={tourId}
      style={{ position: "fixed", inset: 0, zIndex: 1300, pointerEvents: "none" }}
    >
      {/* Spotlight overlay — two rects: full viewport minus cutout */}
      {rect ? (
        <>
          {/* Top strip */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: rect.top - 4, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
          {/* Left strip */}
          <div style={{ position: "absolute", top: rect.top - 4, left: 0, width: Math.max(0, rect.left - 4), height: rect.height + 8, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
          {/* Right strip */}
          <div style={{ position: "absolute", top: rect.top - 4, right: 0, left: rect.right + 4, height: rect.height + 8, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
          {/* Bottom strip */}
          <div style={{ position: "absolute", top: rect.bottom + 4, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
          {/* Spotlight ring */}
          <div style={{
            position: "absolute", top:    rect.top    - 4, left:   rect.left   - 4, width:  rect.width  + 8, height: rect.height + 8, boxShadow: `0 0 0 3px ${COLORS.accent}`, pointerEvents: "none", }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
      )}

      {/* Tooltip */}
      <div
        style={{
          position:      "fixed",
          left:          tipLeft,
          top:           tipTop,
          width:         TOOLTIP_W,
          background:    COLORS.surface,
          borderRadius:  RADIUS.xl,
          boxShadow:     "0 16px 48px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)",
          border:        `1px solid ${COLORS.border}`,
          padding:       "16px",
          pointerEvents: "auto",
          zIndex:        1301, }} className="rounded-admin-md">
        {/* Step counter */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONTS.body }} className="text-admin-ink-muted">
            Step {stepIdx + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={() => finish(false)}
            aria-label="Dismiss tour"
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted, fontSize: 16, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FONTS.body, marginBottom: 4 }} className="text-admin-ink">
          {step.title}
        </div>
        <div style={{ fontSize: 12, fontFamily: FONTS.body, lineHeight: 1.5, marginBottom: 14 }} className="text-admin-ink-muted">
          {step.body}
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width:        i === stepIdx ? 16 : 5,
              height:       5,
              borderRadius: 999,
              background:   i === stepIdx ? COLORS.accent : COLORS.border,
              transition:   `width ${TRANSITION.sm}, background ${TRANSITION.sm}`,
            }} />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {stepIdx > 0 && (
            <button type="button" onClick={() => setStepIdx((i) => i - 1)} style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: COLORS.ink, fontFamily: FONTS.body }}>
              Back
            </button>
          )}
          {step.ctaLabel && step.onCta && (
            <button type="button" onClick={() => { step.onCta!(); setStepIdx((i) => Math.min(i + 1, steps.length - 1)); }} style={{ background: COLORS.accentSoft, border: "none", borderRadius: RADIUS.md, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: COLORS.accent, fontFamily: FONTS.body }}>
              {step.ctaLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => isLast ? finish(true) : setStepIdx((i) => i + 1)}
            style={{ background: COLORS.fill, border: "none", borderRadius: RADIUS.md, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff", fontFamily: FONTS.body }}
          >
            {isLast ? "Done ✓" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.6  Stale-data detection — "Updated by Marco — refresh ↻" pill
// ─────────────────────────────────────────────────────────────────────────────
//
//  data-tulala-stale-pill   — the refresh pill
//
// Usage:
//   const { stale, touch, dismiss } = useStaleDetection("inquiries", 15_000);
//   <StaleDataPill stale={stale} by="Marco" onRefresh={touch} onDismiss={dismiss} />

