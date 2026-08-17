"use client";

/**
 * The inline editor's two hover pills — "Double-click to edit" over a text
 * node, "Replace image" over an `<img>` — plus the placement they share.
 *
 * THE BUG THIS MODULE EXISTS TO FIX. Both pills used to be hand-placed INSIDE
 * the hovered box (`left: rect.right - 132`, `top: rect.top + 6`), which put
 * them squarely on top of the thing the operator was reaching for:
 *
 *   - On a wide heading the hint covered the opening words.
 *   - Anchoring to the box's RIGHT edge meant the pill jumped left/right as
 *     the pointer moved between blocks of different widths — it read as the
 *     hint darting around the canvas.
 *   - The image pill is `pointer-events: auto`, so it did not merely look
 *     like it was in the way: it physically intercepted the drag meant to
 *     grab the image.
 *
 * Both now go through `resolveAnchoredToolbarStack`, the same tested placement
 * the selection toolbars use: ABOVE the box, flipping BELOW (or just inside
 * the visible edge for a box taller than the viewport), centred and clamped
 * clear of the topbar, the docks and the viewport edges. The pill lands beside
 * the element instead of over it, and its position is a pure function of the
 * box, so it stops moving unpredictably.
 *
 * Placement runs as a LAYOUT effect (measure-then-write, before paint) rather
 * than as an inline `style`, because the anchor math needs the pill's real
 * rendered size — the copy is translated, so a hardcoded width was never
 * right. The 0/0 seed rendered below never reaches the screen.
 *
 * Whether the pills render at all is the caller's call: both are canvas
 * helpers, gated by the topbar (i) switch (`canvas-helpers-mode.ts`).
 */

import { useLayoutEffect, useRef, type RefObject } from "react";

import { hoverAttributionProps } from "./canvas-hover-attribution";
import { positionAnchoredToolbarStack } from "./canvas-toolbar-anchor";

/**
 * Anchor one hover pill to `rect`. Returns the ref to attach to the pill.
 * Safe to call unconditionally — a false `active` or null `rect` is a no-op.
 */
function useAnchoredHoverPill<T extends HTMLElement>(
  active: boolean,
  rect: DOMRect | null,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active || !rect) return;
    positionAnchoredToolbarStack(
      { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      [el],
    );
  }, [active, rect]);
  return ref;
}

/** "Double-click to edit" — informational only, never takes the pointer. */
export function InlineTextHintPill({
  show,
  rect,
}: {
  show: boolean;
  rect: DOMRect | null;
}) {
  const ref = useAnchoredHoverPill<HTMLDivElement>(show, rect);
  if (!show || !rect) return null;
  return (
    <div
      ref={ref}
      data-edit-overlay="inline-text-hint"
      style={{ position: "fixed", top: 0, left: 0, zIndex: 114, pointerEvents: "none" }}
      className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[#3f3f46] shadow-md backdrop-blur"
    >
      {/* Text-cursor icon */}
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M17 6H7M17 18H7M12 6v12" />
        <path d="M10 6 Q12 4 14 6" />
        <path d="M10 18 Q12 20 14 18" />
      </svg>
      Double-click to edit
    </div>
  );
}

/**
 * "Replace image" — a real button; opens the media picker.
 *
 * `nodeId` is the block the hovered image belongs to. The pill is
 * `pointer-events: auto` and lives in the editor's overlay layer, so without
 * that declaration the inline editor's own pointermove read the pill as "not
 * on an image any more" and unmounted it the instant the operator reached for
 * it (canvas-hover-attribution.ts — same bug class as the blinking drag grip).
 */
export function InlineReplaceImagePill({
  show,
  rect,
  nodeId,
  onReplace,
}: {
  show: boolean;
  rect: DOMRect | null;
  nodeId?: string | null;
  onReplace: () => void;
}) {
  const ref = useAnchoredHoverPill<HTMLButtonElement>(show, rect);
  if (!show || !rect) return null;
  return (
    <button
      ref={ref}
      type="button"
      data-edit-overlay="inline-replace"
      {...hoverAttributionProps(nodeId)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onReplace();
      }}
      style={{ position: "fixed", top: 0, left: 0, zIndex: 115 }}
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[#18181b] shadow-lg backdrop-blur transition hover:bg-[#f3f0e8]"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
      Replace image
    </button>
  );
}
