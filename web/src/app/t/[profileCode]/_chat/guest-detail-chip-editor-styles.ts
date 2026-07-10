/**
 * Shared style helpers for the per-kind GuestDetailChipEditor sub-editors
 * (Date / Location / Headcount / Event Type / Budget).
 *
 * Extracted verbatim from GuestDetailChipEditor.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import type { CSSProperties } from "react";
import { accentText, FONT, inputStyleFor, type Palette } from "./mini-chat-styles";

export function editorWrap(C: Palette): CSSProperties {
  return {
    padding: "12px 14px",
    background: C.surfaceFaint,
    borderTop: `1px solid ${C.borderSoft}`,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontFamily: FONT,
  };
}

export function labelStyle(C: Palette): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: C.inkMuted,
    textTransform: "uppercase",
  };
}

export const rowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

export const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  paddingTop: 4,
};

export function ghostBtnStyle(C: Palette): CSSProperties {
  return {
    height: 32,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "transparent",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: 500,
    color: C.inkMuted,
    cursor: "pointer",
  };
}

export function toggleStyle(active: boolean, accent: string, C: Palette): CSSProperties {
  return {
    height: 30,
    padding: "0 10px",
    borderRadius: 8,
    border: active ? `1.5px solid ${accent}` : `1px solid ${C.border}`,
    background: active ? `${accent}18` : C.surface,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    // Active toggle text sits on a pale `${accent}18` tint composited over the
    // active surface. A bright tenant accent (Impronta ships GOLD) as raw text
    // drops below the WCAG 1.4.3 AA floor there. accentText() darkens/clamps the
    // accent against the ACTIVE surfaceFaint until it clears >=4.5:1; the tint
    // itself is unchanged.
    color: active ? accentText(accent, C.surfaceFaint) : C.ink,
    cursor: "pointer",
    transition: "all 100ms",
  };
}

// `accent` is threaded into a CSS custom property so the co-located .focusRing
// module can paint a keyboard-focus ring in the tenant brand color. The inline
// `outline: none` (from inputStyleFor) keeps mouse focus ring-free; :focus-visible
// re-adds the ring for keyboard users only (WCAG 2.4.7).
export function smallInputStyle(C: Palette, accent?: string): CSSProperties {
  return {
    ...inputStyleFor(C),
    height: 34,
    padding: "0 10px",
    fontSize: 13,
    ...(accent ? { ["--chat-focus-accent" as string]: accent } : {}),
  };
}
