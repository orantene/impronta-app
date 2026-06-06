"use client";

import { useState } from "react";

import { CHROME } from "../kit/tokens";
import { ColorPickerPopover } from "../kit/color-picker";

function isHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(color.trim());
}

/**
 * ColorSwatchButton — a 7×7 swatch that opens the branded in-app
 * ColorPickerPopover (HSV surface) instead of an OS `<input type="color">`,
 * unifying the color surface across the gradient / layer builders (W3-T5).
 *
 * Self-contained: only this component owns its transient open/closed UI state,
 * so the upstream builders stay STATELESS — the composed CSS string remains the
 * source of truth. Uses the codebase callback-ref-into-state pattern (see
 * kit/swatch.tsx) to plumb the popover anchor without a render-time `.current`.
 */
export function ColorSwatchButton({
  color,
  onChange,
  dataAttr,
  ariaLabel,
}: {
  color: string;
  onChange: (next: string) => void;
  /** [attrName, attrValue] preserved as the picker's QA/test hook. */
  dataAttr?: readonly [string, string];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const hex = isHexColor(color) ? color : null;
  const dataProps = dataAttr ? { [dataAttr[0]]: dataAttr[1] } : {};
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        {...dataProps}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded"
        style={{ border: `1px solid ${CHROME.controlBorder}`, background: hex ?? "transparent" }}
      >
        {!hex ? (
          <span
            aria-hidden
            className="absolute inset-0 bg-[repeating-conic-gradient(#e5e0d8_0_25%,#fff_0_50%)] bg-[length:8px_8px]"
          />
        ) : null}
      </button>
      <ColorPickerPopover
        open={open}
        anchor={anchor}
        value={color}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
