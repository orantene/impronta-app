"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import {
  dismissCoachmark,
  isCoachmarkDismissed,
  nextUndismissedCoachmark,
  type CoachmarkId,
} from "./builder-coachmarks";
import { CHROME, CHROME_SHADOWS } from "./kit/tokens";

/**
 * One-shot contextual tip anchored near a builder affordance.
 * Persists dismissal per tenant via `builder-coachmarks.ts`.
 *
 * When `sequence` is provided the tip is only shown if `id` is the
 * first undismissed entry in that sequence — enforcing one-at-a-time
 * display so the canvas is never smothered by multiple simultaneous tips.
 */
export function BuilderCoachmarkTip({
  id,
  message,
  placement = "below",
  sequence,
  wrapperStyle,
  children,
}: {
  id: CoachmarkId;
  message: string;
  placement?: "below" | "above";
  /**
   * When provided, this tip only becomes visible once `id` is the first
   * undismissed entry in `sequence`. Allows groups of coachmarks to surface
   * one-at-a-time without coupling tip components to each other.
   */
  sequence?: ReadonlyArray<CoachmarkId>;
  /** Optional layout on the outer wrapper (e.g. flex: 1 in a tab bar). */
  wrapperStyle?: CSSProperties;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isCoachmarkDismissed(id)) return;
    // If a sequence is provided, only show when this id is the active one.
    if (sequence && nextUndismissedCoachmark(sequence) !== id) return;
    setVisible(true);
  }, [id, sequence]);

  const dismiss = useCallback(() => {
    dismissCoachmark(id);
    setVisible(false);
  }, [id]);

  return (
    <span className="relative inline-flex" style={wrapperStyle}>
      {children}
      {visible ? (
        <div
          role="status"
          data-edit-overlay={`coachmark-${id}`}
          className="pointer-events-auto absolute z-[130] flex max-w-[220px] items-start gap-2 rounded-lg px-2.5 py-2"
          style={{
            ...(placement === "below"
              ? { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }
              : { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }),
            background: "rgba(42, 49, 71, 0.96)",
            color: "rgba(255,255,255,0.94)",
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.35,
            boxShadow: CHROME_SHADOWS.popover,
            border: `1px solid ${CHROME.lineStrong}`,
          }}
        >
          <span className="flex-1">{message}</span>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 cursor-pointer rounded border-none bg-white/12 px-1.5 py-0.5 text-[10px] font-semibold text-white/90"
          >
            Got it
          </button>
        </div>
      ) : null}
    </span>
  );
}
