"use client";

/**
 * GuidedTour — reusable first-run tooltip overlay (WS-9.7).
 *
 * Pins a sequence of tooltips to real DOM elements via
 * `getBoundingClientRect()`. Renders an SVG-mask spotlight backdrop so
 * the highlighted target is visually punched out of a darkened overlay.
 *
 * Used by:
 *   - <AdminTour>     for first-time admin onboarding (storage: tulala_admin_tour_done)
 *   - <TalentTour>    can be added later for talent first-run
 *   - <ClientTour>    can be added later for client first-run
 *
 * Each consumer supplies its own steps + storage key. The primitive
 * handles kickoff timing, target measurement, navigation between
 * steps, viewport clamping, and persistence.
 */

import { useEffect, useRef, useState } from "react";
import { COLORS, FONTS } from "./_state";

export type TourStep = {
  /** CSS selector that must already be in the DOM. */
  selector: string;
  title: string;
  body: string;
  /** Where the tooltip renders relative to the target. */
  position: "top" | "bottom" | "left" | "right";
};

export function GuidedTour({
  steps,
  storageKey,
  sessionKey,
  /** Optional label shown in the progress strip ("30s tour", "1 min", etc). */
  durationLabel,
  /** Initial delay before step 0 fires on first mount. Default 1500ms. */
  kickoffDelayMs = 1500,
}: {
  steps: TourStep[];
  storageKey: string;
  sessionKey?: string;
  durationLabel?: string;
  kickoffDelayMs?: number;
}) {
  const [stepIdx, setStepIdx] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // First-mount kickoff — only fire if never seen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(storageKey) === "1") return;
    } catch {
      // localStorage blocked (privacy mode) — start the tour anyway.
    }
    // If a session-key is provided, use it to survive remounts that
    // happen during URL hydration. Without it, the tour would restart
    // every remount.
    let initialDelay = kickoffDelayMs;
    if (sessionKey) {
      try {
        if (window.sessionStorage.getItem(sessionKey) === "1") {
          initialDelay = 0;
        } else {
          window.sessionStorage.setItem(sessionKey, "1");
        }
      } catch {}
    }
    const t = setTimeout(() => setStepIdx(0), initialDelay);
    return () => clearTimeout(t);
  }, [storageKey, sessionKey, kickoffDelayMs]);

  // Measure the current target whenever the step changes or the window resizes.
  useEffect(() => {
    if (stepIdx === null) return;
    const measure = () => {
      const step = steps[stepIdx];
      if (!step) return;
      const target = document.querySelector(step.selector);
      if (target) {
        setRect(target.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [stepIdx, steps]);

  if (stepIdx === null) return null;
  const step = steps[stepIdx];
  if (!step) return null;
  const isLast = stepIdx === steps.length - 1;

  const closeTour = () => {
    try { window.localStorage.setItem(storageKey, "1"); } catch {}
    setStepIdx(null);
  };
  const next = () => {
    if (isLast) closeTour();
    else setStepIdx(stepIdx + 1);
  };

  // Compute tooltip position from the target rect + step.position.
  const tipPos = (() => {
    if (!rect) return { top: 100, left: 100 };
    const pad = 12;
    const tipW = 320;
    const tipH = 150;
    if (step.position === "left") {
      return {
        top: rect.top + rect.height / 2 - tipH / 2,
        left: rect.left - tipW - pad,
      };
    }
    if (step.position === "right") {
      return {
        top: rect.top + rect.height / 2 - tipH / 2,
        left: rect.right + pad,
      };
    }
    if (step.position === "top") {
      return {
        top: rect.top - tipH - pad,
        left: rect.left + rect.width / 2 - tipW / 2,
      };
    }
    // bottom
    return {
      top: rect.bottom + pad,
      left: rect.left + rect.width / 2 - tipW / 2,
    };
  })();

  // Clamp to viewport
  const clampedTop = Math.max(12, Math.min(window.innerHeight - 180, tipPos.top));
  const clampedLeft = Math.max(12, Math.min(window.innerWidth - 332, tipPos.left));

  // Stable mask ID per storage-key so multiple tours can coexist.
  const maskId = `tulala-tour-mask-${storageKey.replace(/[^a-z0-9]/gi, "-")}`;

  return (
    <div data-tulala-guided-tour={storageKey} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      pointerEvents: "auto",
      fontFamily: FONTS.body,
    }}>
      {rect ? (
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <mask id={maskId}>
              <rect width="100%" height="100%" fill="#fff" />
              <rect
                x={rect.left - 6} y={rect.top - 6}
                width={rect.width + 12} height={rect.height + 12}
                rx="14" fill="#000"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(11,11,13,0.55)" mask={`url(#${maskId})`} />
          <rect
            x={rect.left - 6} y={rect.top - 6}
            width={rect.width + 12} height={rect.height + 12}
            rx="14" fill="none"
            stroke={COLORS.accent} strokeWidth="2" opacity="0.85"
          />
        </svg>
      ) : (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(11,11,13,0.55)", backdropFilter: "blur(2px)",
        }} />
      )}

      <div
        ref={tooltipRef}
        role="dialog"
        aria-labelledby={`tulala-tour-title-${storageKey}`}
        style={{
          position: "absolute",
          top: clampedTop, left: clampedLeft,
          width: 320,
          background: "#fff", borderRadius: 14,
          boxShadow: "0 24px 60px -10px rgba(11,11,13,0.40)",
          padding: 16,
          fontFamily: FONTS.body,
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 4, marginBottom: 4,
        }}>
          {steps.map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= stepIdx ? COLORS.accent : "rgba(11,11,13,0.10)",
            }} />
          ))}
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, color: COLORS.inkDim, textTransform: "uppercase", marginBottom: 6 }}>
          {stepIdx + 1} of {steps.length}{durationLabel ? ` · ${durationLabel}` : ""}
        </div>
        <h3 id={`tulala-tour-title-${storageKey}`} style={{
          margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.ink, letterSpacing: -0.2,
        }}>{step.title}</h3>
        <p style={{
          margin: "6px 0 12px", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5,
        }}>{step.body}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={closeTour} style={{
            background: "transparent", border: "none", padding: 0,
            color: COLORS.inkMuted, cursor: "pointer",
            fontSize: 11.5, fontWeight: 500,
          }}>Skip</button>
          <div style={{ display: "flex", gap: 6 }}>
            {stepIdx > 0 && (
              <button type="button" onClick={() => setStepIdx(stepIdx - 1)} style={{
                padding: "8px 14px", borderRadius: 999,
                background: "transparent", border: `1px solid ${COLORS.borderSoft}`,
                color: COLORS.ink,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>Back</button>
            )}
            <button type="button" onClick={next} style={{
              padding: "8px 16px", borderRadius: 999, border: "none",
              background: COLORS.fill, color: "#fff",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>{isLast ? "Got it" : "Next →"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Helper to clear a tour's "seen" flag and force-replay on next mount. */
export function resetGuidedTour(storageKey: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(storageKey); } catch {}
  window.location.reload();
}
