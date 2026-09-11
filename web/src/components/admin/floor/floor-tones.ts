/**
 * floor-tones.ts — the board's six colours, as admin token classes.
 *
 * `POSLiveFloor.dc.html` draws a tile in one of six tones and the legend
 * names them: free (white), arriving (indigo wash), held / late (coral
 * wash), seated (forest wash), needs reset (slate wash) and blocked (grey).
 * The list's pills and the panel's pills use the same washes, so the same
 * table reads the same colour in every view. Every colour is an `admin-*`
 * token; there is no hex here and none in the components that use this.
 */

import type { FloorTone } from "./floor-model";

/** A tile: 2px border, tinted wash, tinted ink. */
export const TILE_TONE: Readonly<Record<FloorTone, string>> = {
  free: "border-admin-border bg-admin-card text-admin-ink",
  arriving: "border-admin-indigo bg-admin-indigo-soft text-admin-indigo",
  held: "border-admin-coral bg-admin-coral-soft text-admin-coral-deep",
  seated: "border-admin-brand bg-admin-brand-soft text-admin-brand",
  over: "border-admin-coral bg-admin-coral-soft text-admin-coral-deep",
  reset: "border-admin-amber bg-admin-amber-soft text-admin-amber",
  blocked: "border-admin-border-strong bg-admin-surface-alt text-admin-ink-dim",
};

/** The legend swatch and the pill wash for the same tone. */
export const PILL_TONE: Readonly<Record<FloorTone, string>> = {
  free: "bg-admin-surface-alt text-admin-ink-muted",
  arriving: "bg-admin-indigo-soft text-admin-indigo",
  held: "bg-admin-coral-soft text-admin-coral-deep",
  seated: "bg-admin-brand-soft text-admin-brand",
  over: "bg-admin-coral-soft text-admin-coral-deep",
  reset: "bg-admin-amber-soft text-admin-amber",
  blocked: "bg-admin-amber-soft text-admin-amber",
};

/** The legend's 14px swatch: the wash alone. */
export const SWATCH_TONE: Readonly<Record<FloorTone, string>> = {
  free: "bg-admin-card",
  arriving: "bg-admin-indigo-soft",
  held: "bg-admin-coral-soft",
  seated: "bg-admin-brand-soft",
  over: "bg-admin-coral-soft",
  reset: "bg-admin-amber-soft",
  blocked: "bg-admin-surface-alt",
};

/** The board's 13.5px pill: `Seated`, `Over by 11`, `Arriving`, `Confirmed`. */
export const FLOOR_PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-[5px] text-[13.5px] font-semibold";

/** The panel's `Confirmed` pill is the success green, not the seated forest. */
export const PILL_CONFIRMED = "bg-admin-success-soft text-admin-success";
export const PILL_WAITING = "bg-admin-amber-soft text-admin-amber";
export const PILL_LATE = "bg-admin-coral-soft text-admin-coral-deep";
export const PILL_SEATED = "bg-admin-brand-soft text-admin-brand";
export const PILL_BILL_OPEN = "bg-admin-critical-soft text-admin-red";

/** The timeline's blocks: a hairline border over the wash. */
export const BLOCK_TONE: Readonly<Record<FloorTone, string>> = {
  free: "border-admin-border bg-admin-card text-admin-ink",
  arriving: "border-admin-indigo/50 bg-admin-indigo-soft text-admin-indigo",
  held: "border-admin-coral/50 bg-admin-coral-soft text-admin-coral-deep",
  seated: "border-admin-brand/50 bg-admin-brand-soft text-admin-brand",
  over: "border-admin-coral/50 bg-admin-coral-soft text-admin-coral-deep",
  reset: "border-admin-coral/50 bg-admin-coral-soft text-admin-coral-deep",
  blocked: "border-admin-border-strong bg-admin-surface-alt text-admin-ink-dim",
};

/** The section eyebrow: `BOOTHS`, `MAIN HALL`, `ASSIGNED`. */
export const FLOOR_EYEBROW = "text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted";

/** A radio-card option in a sheet or dialog. */
export const OPTION_CARD =
  "flex w-full items-start gap-3 rounded-[14px] border-[1.5px] px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand disabled:cursor-not-allowed";
export const OPTION_CARD_ACTIVE = "border-admin-brand bg-admin-brand-soft";
export const OPTION_CARD_IDLE = "border-admin-border bg-admin-card hover:bg-admin-surface-alt";
export const OPTION_CARD_OFF = "border-admin-border bg-admin-card text-admin-ink-dim";

/** A fact row in a summary card: label left, value right, hairline under. */
export const FACT_ROW = "flex items-baseline justify-between gap-4 border-b border-admin-border-soft py-2.5 text-[15px] last:border-b-0";
