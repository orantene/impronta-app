"use client";

/**
 * Canvas-helpers (i) switch — one control for every teaching overlay the
 * canvas paints over the operator's own content: the "Double-click to edit"
 * hint, the hover "Replace image" pill, the one-shot coachmark tips.
 *
 * They are the right default for a first-time operator and pure friction for
 * a daily one, who reaches for a block and finds a pill floating beside it.
 * Dismissing coachmarks one at a time never silenced the hover pills at all,
 * so this is the single off switch — see `canvas-helpers-mode.ts` for exactly
 * what OFF does and does not hide.
 */

import { useCanvasHelpers } from "./canvas-helpers-mode";
import { TB_ICON_PX, TbIconBtn } from "./topbar-icon-button";

export function CanvasHelpersToggle() {
  const { helpers, toggle } = useCanvasHelpers();
  return (
    <TbIconBtn
      onClick={toggle}
      title={
        helpers
          ? "Hide canvas helpers — the double-click hint, the replace-image pill and the tips. Editing gestures keep working."
          : "Show canvas helpers — hints and tips on the canvas"
      }
      ariaLabel={helpers ? "Hide canvas helpers" : "Show canvas helpers"}
    >
      <svg
        width={TB_ICON_PX}
        height={TB_ICON_PX}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-5" />
        <path d="M12 8h.01" />
        {/* Struck through when helpers are off — same read as the eye/eye-off
            pair next to it, so the glyph states what the click will undo. */}
        {helpers ? null : <line x1="4" y1="20" x2="20" y2="4" />}
      </svg>
    </TbIconBtn>
  );
}
