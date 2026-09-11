/**
 * pos-classes.ts — shared Tailwind class strings for the point of sale.
 *
 * THE BOARD IS A LIGHT SURFACE WITH ADMIN INK (`POSCounter.dc.html`): white
 * cards on the admin surface, a 1.5px hairline border, forest brand for the
 * one primary action, coral/red/indigo/slate for the small badges. Every
 * colour here is an `admin-*` token utility (`text-admin-ink`,
 * `bg-admin-card`, `border-admin-border`, `bg-admin-brand`, ...). The shadcn
 * semantic names (`text-foreground`, `bg-card`) are NOT used on purpose: on
 * a tenant host they resolved to the storefront's dark values inside the POS
 * chrome and the counter rendered in muddy grey (see the
 * `[data-tulala-pos-chrome]` block in `app/globals.css`).
 *
 * Touch targets: the counter is worked standing up, on a tablet. Primary
 * actions are 56px or taller; every other control is at least 44px.
 */

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand focus-visible:ring-offset-2 focus-visible:ring-offset-admin-surface";

const DISABLED = "disabled:cursor-not-allowed disabled:opacity-40";

/** The forest button: `Charge $485`, `Hold sale` confirm, `Save changes`. */
export const POS_PRIMARY_ACTION = `inline-flex h-14 items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border-[1.5px] border-admin-brand bg-admin-brand px-6 text-[17px] font-semibold text-admin-card transition-opacity hover:opacity-90 ${FOCUS} ${DISABLED}`;

/** The white button beside it: `Hold sale`, `Send 1 item`, `Cancel`, `Back`. */
export const POS_SECONDARY_ACTION = `inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border-[1.5px] border-admin-border bg-admin-card px-[18px] text-[15px] font-semibold text-admin-ink transition-colors hover:bg-admin-surface-alt ${FOCUS} ${DISABLED}`;

/** The outlined forest button: `Link only`, `Try again`, `Use existing`. */
export const POS_OUTLINE_ACTION = `inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border-[1.5px] border-admin-brand bg-admin-card px-[18px] text-[15px] font-semibold text-admin-brand transition-colors hover:bg-admin-brand-soft ${FOCUS} ${DISABLED}`;

/** The red-outlined button: `Discard sale`, `Remove line`. */
export const POS_DANGER_ACTION = `inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border-[1.5px] border-admin-red bg-admin-card px-[18px] text-[15px] font-semibold text-admin-red transition-colors hover:bg-admin-critical-soft ${FOCUS} ${DISABLED}`;

/** A 44px icon-only or compact control. */
export const POS_ICON_ACTION = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-[1.5px] border-admin-border bg-admin-card text-admin-ink transition-colors hover:bg-admin-surface-alt ${FOCUS} ${DISABLED}`;

/** The 44px close button on a sheet or dialog header. */
export const POS_CLOSE_ACTION = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-admin-surface-alt text-admin-ink transition-colors hover:bg-admin-border ${FOCUS}`;

/** Category chips: `Favorites` (active) · `Coffee` · `Food`. */
export const POS_CHIP = `inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border-[1.5px] px-4 text-[15px] font-semibold transition-colors ${FOCUS} ${DISABLED}`;
export const POS_CHIP_ACTIVE = "border-admin-brand bg-admin-brand-soft text-admin-brand";
export const POS_CHIP_IDLE = "border-admin-border bg-admin-card text-admin-ink hover:bg-admin-surface-alt";

/** Segmented control: the grey track and its white selected pill. */
export const POS_SEGMENT_TRACK = "inline-flex gap-[2px] rounded-[12px] bg-admin-surface-alt p-1";
export const POS_SEGMENT = `inline-flex h-10 items-center justify-center whitespace-nowrap rounded-[9px] px-3 text-[14px] font-semibold transition-colors ${FOCUS} ${DISABLED}`;
export const POS_SEGMENT_ACTIVE = "bg-admin-card text-admin-ink shadow-admin-rest";
export const POS_SEGMENT_IDLE = "text-admin-ink-muted hover:text-admin-ink";

/** A white card with the board's 16px radius and hairline border. */
export const POS_SURFACE = "rounded-[16px] border-[1.5px] border-admin-border bg-admin-card";

/** A 52px text field: search, names, notes. */
export const POS_INPUT = `h-[52px] w-full rounded-[12px] border-[1.5px] border-admin-border bg-admin-card px-4 text-[16px] text-admin-ink placeholder:text-admin-ink-dim ${FOCUS} disabled:cursor-not-allowed disabled:bg-admin-surface-alt disabled:text-admin-ink-dim`;

/** A form label above a field. */
export const POS_LABEL = "mb-1.5 block text-[14px] font-semibold text-admin-ink";

/** One key of a money or PIN keypad. */
export const POS_KEY = `inline-flex h-16 items-center justify-center rounded-[14px] border-[1.5px] border-admin-border bg-admin-card text-[26px] font-semibold text-admin-ink transition-colors hover:bg-admin-surface-alt ${FOCUS} ${DISABLED}`;

/** The refusal banner (`data-pos-refusal`). */
export const POS_REFUSAL_BANNER =
  "flex items-start gap-3 rounded-[12px] border-[1.5px] border-admin-red/40 bg-admin-critical-soft p-4 text-[14px] text-admin-red";

/** A quiet note card: `Over your $500 limit`, `Cashier view shows…`. */
export const POS_NOTE = "flex items-start gap-2.5 rounded-[12px] bg-admin-surface-alt px-4 py-3 text-[14px] text-admin-ink-muted";
export const POS_NOTE_WARN = "flex items-start gap-2.5 rounded-[12px] bg-admin-coral-soft px-4 py-3 text-[14px] text-admin-coral-deep";
export const POS_NOTE_INFO = "flex items-start gap-2.5 rounded-[12px] bg-admin-indigo-soft px-4 py-3 text-[14px] text-admin-indigo-deep";

/** A small rounded status pill. Compose with one of the tones below. */
export const POS_PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";
export const POS_PILL_SLATE = "bg-admin-amber-soft text-admin-amber";
export const POS_PILL_CORAL = "bg-admin-coral-soft text-admin-coral-deep";
export const POS_PILL_RED = "bg-admin-critical-soft text-admin-red";
export const POS_PILL_INDIGO = "bg-admin-indigo-soft text-admin-indigo";
export const POS_PILL_GREEN = "bg-admin-success-soft text-admin-success";

/** A totals row: label left, figure right, hairline under. */
export const POS_TOTAL_ROW = "flex items-center justify-between gap-3 border-b border-admin-border-soft py-2 text-[15px]";

/** Tabular figures for every money column. */
export const POS_NUM = "tabular-nums";

/** The eyebrow over a section: `ELIGIBLE LINES`, `HOW`, `YESTERDAY`. */
export const POS_EYEBROW = "text-[12px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted";
