"use client";

/**
 * ColorRow — open color input row used across the site-header inspector.
 *
 * 2026-04-30 — extracted from StyleTab so Brand tab (brand colors) and
 * Layout tab (header surface colors) share one implementation. The row
 * accepts ANY CSS color value (hex, rgba, hsla, oklch, css-vars). Empty
 * string clears the override.
 *
 * Behavior contract:
 *   - The visible swatch IS the trigger — clicking it opens the in-app
 *     ColorPickerPopover (HSV surface + hex echo + eyedropper + recents),
 *     so color-picking stays on the branded chrome instead of dropping to
 *     OS color chrome (W3-T5). The text field shows the current value as a
 *     secondary input for paste-friendly hex / rgba editing.
 *   - Typing in the text field defers the onChange until blur (or
 *     Enter), so a partial hex like "#ff" doesn't fire 5 saves.
 *   - The popover fires onChange on every HSV drag step (smooth
 *     live-preview), but the parent's enqueueToken debounce coalesces
 *     these into one save once the picker closes.
 *   - Clear button only appears when there's a value to clear.
 */

import { useEffect, useState } from "react";

// site-header/shared sits two levels under inspectors/, so the kit
// (inspectors/kit) is two `..` up. Don't reach for the edit-chrome
// kit — that's a different KIT export with different tokens.
import { KIT } from "../../kit";
import { ColorPickerPopover } from "../../../kit/color-picker";

interface ColorRowProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
}

export function ColorRow({ label, hint, value, onChange }: ColorRowProps) {
  const [draft, setDraft] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Callback-ref into state keeps render pure (no `.current` access) — the
  // codebase pattern for plumbing a popover anchor (see kit/swatch.tsx).
  const [swatchAnchor, setSwatchAnchor] = useState<HTMLButtonElement | null>(null);
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);

  // Sync local draft if the server-side value updates while we're idle.
  //
  // QA 2026-05-13 — previously called `setDraft(value)` directly in the
  // render body, which triggers a second synchronous render and trips
  // React 19 Strict Mode's double-invoke warnings. Moved into an effect
  // so the sync is post-commit and the render stays pure. The
  // active-element guard still applies (don't clobber a user mid-typing).
  useEffect(() => {
    if (draft === value) return;
    if (typeof document !== "undefined" && document.activeElement?.tagName === "INPUT") {
      return;
    }
    setDraft(value);
  }, [value, draft]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className={KIT.label}>{label}</span>
        {hint ? <span className={KIT.hint}>{hint}</span> : null}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2 py-1.5">
        {/* In-app color picker — the visible swatch button opens the branded
         *  ColorPickerPopover (HSV surface) instead of the OS picker (W3-T5).
         *  The square shows the current color, or a checkered "no value"
         *  pattern when the value isn't a plain hex. */}
        <button
          ref={setSwatchAnchor}
          type="button"
          aria-label={`Change ${label.toLowerCase()} color`}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
          className="relative inline-block size-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-stone-200 transition hover:scale-105"
          style={{ background: isHex ? value : "transparent" }}
        >
          {!isHex ? (
            <span
              aria-hidden
              className="absolute inset-0 bg-[repeating-conic-gradient(#e5e0d8_0_25%,#fff_0_50%)] bg-[length:8px_8px]"
            />
          ) : null}
        </button>
        <ColorPickerPopover
          open={pickerOpen}
          anchor={swatchAnchor}
          value={value}
          onChange={(next) => {
            setDraft(next);
            onChange(next);
          }}
          onClose={() => setPickerOpen(false)}
        />
        <input
          type="text"
          className="flex-1 bg-transparent font-mono text-[12px] text-stone-700 placeholder:text-stone-500 focus:outline-none"
          placeholder="#— or rgba()"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onChange(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(value);
              e.currentTarget.blur();
            }
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onChange("");
            }}
            className="text-[10.5px] font-medium text-stone-500 transition hover:text-rose-600"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
