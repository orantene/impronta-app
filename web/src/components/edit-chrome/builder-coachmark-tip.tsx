"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import {
  dismissCoachmark,
  isCoachmarkDismissed,
  nextUndismissedCoachmark,
  subscribeCoachmarkDismissed,
  type CoachmarkId,
} from "./builder-coachmarks";
import { useCanvasHelpers } from "./canvas-helpers-mode";
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
  // Topbar (i) switch. Read as a live value rather than folded into `visible`
  // so flipping helpers back ON restores any tip that is still undismissed,
  // instead of leaving it suppressed for the rest of the session.
  const { helpers } = useCanvasHelpers();

  useEffect(() => {
    if (isCoachmarkDismissed(id)) return;
    // If a sequence is provided, only show when this id is the active one.
    if (sequence && nextUndismissedCoachmark(sequence) !== id) return;
    setVisible(true);
  }, [id, sequence]);

  // Hide immediately when this id is dismissed from ANYWHERE — not just this
  // tip's own "Got it" button. Covers the case where the operator performs
  // the taught gesture directly (e.g. double-clicking text opens the inline
  // editor, which dismisses "double-click-edit" programmatically) — without
  // this the already-mounted, already-visible tip has no way to learn its id
  // was dismissed and stays dangling near the canvas until manually closed.
  useEffect(() => {
    return subscribeCoachmarkDismissed((dismissedId) => {
      if (dismissedId === id) setVisible(false);
    });
  }, [id]);

  const dismiss = useCallback(() => {
    dismissCoachmark(id);
    setVisible(false);
  }, [id]);

  return (
    <span className="relative inline-flex" style={wrapperStyle}>
      {children}
      {visible && helpers ? (
        <div
          role="status"
          data-edit-overlay={`coachmark-${id}`}
          // min-w prevents the shrink-to-fit sizing of an absolutely-positioned
          // box with a flex-1 text child from collapsing to its narrowest word
          // (flex-basis: 0% starves the max-content width calc) — without it
          // the message rendered one word per line in a ~90px column.
          className="pointer-events-auto absolute z-[130] flex min-w-[180px] max-w-[220px] items-start gap-2 whitespace-normal rounded-lg px-2.5 py-2"
          style={{
            ...(placement === "below"
              ? { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }
              : { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }),
            // Light surface, matching every other floating canvas control. It
            // was the last dark-navy chrome left, and once the selection chip
            // docked to the bottom bar this tooltip sat on top of it as a dark
            // slab over a white bar.
            background: CHROME.surface,
            color: CHROME.ink,
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.35,
            boxShadow: CHROME_SHADOWS.popover,
            border: `1px solid ${CHROME.line}`,
          }}
        >
          <span className="flex-1">{message}</span>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 cursor-pointer rounded border-none px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              // bg-white/12 + text-white/90 were invisible on the light surface
              // — the same white-on-white class of bug as ChipBtn /
              // ContextMenuButton / CanvasMiniButton.
              background: "rgba(24,24,27,0.06)",
              color: CHROME.muted,
            }}
          >
            Got it
          </button>
        </div>
      ) : null}
    </span>
  );
}
