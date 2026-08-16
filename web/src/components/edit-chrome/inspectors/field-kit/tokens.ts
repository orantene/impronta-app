/**
 * Inspector FIELD KIT — visual constants (Inspector Reset, lane P1).
 *
 * WHY THIS FILE EXISTS
 * The Style/Content inspector audit (2026-08-16) counted, in ONE column:
 * 20 different control patterns for "pick one of N or set a value",
 * 19 disclosures disguised as labels, 7 border radii, 9 font sizes, and a
 * parchment/khaki palette sitting next to a cool one. The approved fix
 * (D2 + D7 + D9) is a SINGLE control kit on the cool light language.
 *
 * This module is that kit's palette, and it is deliberately tiny:
 *
 *   - ONE border color (`FIELD_KIT.border`). Not an idle/hover/strong trio —
 *     one. Hover and focus are expressed with the accent, not with a third
 *     shade of taupe.
 *   - EXACTLY THREE font sizes (`FIELD_KIT.font`): label, value, caption.
 *     Nine was the audit's headline number; three is the ceiling here.
 *   - RADII ONLY FROM `CHROME_RADII`. No literal `12`, no bespoke `borderRadius: 3`.
 *   - COOL LIGHT LANGUAGE ONLY. White surface, cool ink, cool muted — the
 *     same recipe as `kit/menu-surface.tsx` (CHROME.surface + CHROME_SHADOWS
 *     + CHROME_RADII). This kit is the BEACHHEAD of the palette retirement:
 *     the parchment family (#faf9f6 / #f3f0e8 / #fdfcf9 / #f8f7f2) and the
 *     khaki control borders (#cfc7b6 / #b3a892) are BANNED here, even though
 *     they are still what `KIT` in `inspectors/kit/tokens.ts` hands out. When
 *     P2 replaces a panel section with these primitives, that section leaves
 *     the parchment palette for good.
 *   - NO GOLD / RUST / AMBER. Owner rule, enforced by
 *     `no-gold-rust-chrome.static.test.ts`.
 *
 * Everything below either IS a `CHROME*` value or is derived from one, so the
 * kit cannot drift away from the single chrome source in `kit/tokens.ts`.
 */

import { CHROME, CHROME_MOTION, CHROME_RADII, CHROME_SHADOWS } from "../../kit/tokens";

/**
 * The one border color for every field-kit control edge — chip, tile, well.
 *
 * Cool ink at 16% (`CHROME.lineStrong`), NOT the khaki `CHROME.controlBorder`
 * (#cfc7b6). A control edge needs to be visible; it does not need to be a
 * different hue from the panel it sits in. One value means a chip row and a
 * glyph tile row placed side by side cannot read as two different systems.
 */
const FIELD_BORDER = CHROME.lineStrong;

export const FIELD_KIT = {
  // ── Ground ────────────────────────────────────────────────────────────────
  /** Control fill. White, same as the menu surface. */
  surface: CHROME.surface,
  /** Fill for an unselected chip/tile — a whisper of ink, never parchment. */
  surfaceRecessed: "rgba(24, 24, 27, 0.03)",
  /** Hover fill on white, shared with `MENU_HOVER_FILL`. */
  hoverFill: "rgba(24, 24, 27, 0.05)",

  // ── Ink ───────────────────────────────────────────────────────────────────
  /** Primary text: labels, selected chip text, entered values. */
  ink: CHROME.text,
  /** Secondary text: captions, unselected chip text, units, hints. */
  muted: CHROME.muted,
  /** Disabled / locked text. */
  mutedSoft: CHROME.muted3,

  // ── Edge (exactly one) ────────────────────────────────────────────────────
  border: FIELD_BORDER,

  // ── Selection ─────────────────────────────────────────────────────────────
  /** The one editor accent (violet). Selected chip ink + tile ring. */
  accent: CHROME.accent,
  /** Selected chip / tile fill. */
  accentFill: "rgba(124, 58, 237, 0.08)",
  /** Focus-visible ring, matches the chrome input focus halo. */
  focusRing: CHROME_SHADOWS.inputFocus,

  // ── Type: THREE SIZES. Adding a fourth is a kit-level decision. ───────────
  font: {
    /** Field labels and chip labels. */
    label: 11.5,
    /** Entered values and the numeric input. */
    value: 12.5,
    /** The resolved value under a chip, and glyph-tile captions. */
    caption: 10.5,
  },

  weight: {
    label: 600,
    caption: 500,
  },

  // ── Radii: ONLY from CHROME_RADII. ────────────────────────────────────────
  radius: {
    /** Preset chips and the numeric control. */
    chip: CHROME_RADII.sm,
    /** Glyph tiles. */
    tile: CHROME_RADII.md,
  },

  // ── Rhythm ────────────────────────────────────────────────────────────────
  gap: {
    /** Between chips inside a row, and between tiles in a grid. */
    tight: 4,
    /** Between a label and its control, and between control and accessory. */
    control: 8,
    /** Between whole field rows. */
    row: 12,
  },

  size: {
    /**
     * Control height. Matches `NumberUnit`'s hard-coded 30px so the preset
     * chips and the exact input sit on one baseline. If NumberUnit ever
     * changes, change this with it (there is a test).
     */
    control: 30,
    /** Two-line preset chip (label over value) — taller than a text chip. */
    presetChip: 34,
    /** Square glyph area inside a tile. */
    glyph: 26,
    /**
     * Fixed label column. The audit's "ragged left edge" came from every
     * section choosing its own label width; this is the one width.
     */
    labelColumn: 78,
  },

  motion: {
    duration: CHROME_MOTION.durationFast,
    easing: CHROME_MOTION.easeStandard,
  },
} as const;

/**
 * Palette values this kit must never contain. Exported so the kit's own guard
 * test can assert against the same list the doc comment promises, rather than
 * a copy that can drift.
 *
 * Parchment: the warm-white family the inspector is retiring.
 * Khaki: the warm control borders the inspector is retiring.
 */
export const RETIRED_PALETTE: ReadonlyArray<string> = [
  "#faf9f6",
  "#f3f0e8",
  "#fdfcf9",
  "#f8f7f2",
  "#e9e5d9",
  "#cfc7b6",
  "#b3a892",
  "#dcd5c7",
  "#e5e0d5",
] as const;
