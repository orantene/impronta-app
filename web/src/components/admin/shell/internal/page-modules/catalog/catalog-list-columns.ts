/**
 * The Catalog list's columns, by the width of the LIST CARD (a container
 * query), not the viewport.
 *
 * B2 (consultant QA, 2026-10-19): at an 800px window the shell's 240px rail
 * leaves the card about 500px, and the board's eight columns (Item 1.35fr,
 * then 654px of fixed tracks, 84px of gaps and 36px of padding) needed 774px
 * before the Item column got anything. The `fr` tracks collapsed to zero, so
 * every name truncated to nothing and the row overflowed sideways. The phone
 * row (under 720px of viewport) never had the problem.
 *
 * Now the card is a container and the columns drop in order of least use as
 * it narrows: Preparation (always a dash), then Availability, then Type and
 * Channels. The Item track always keeps a real minimum, and each tier's
 * minimum fits inside the width that switches it on
 * (`catalog-list-columns.test.ts` does the sums).
 *
 * Class strings stay literal so Tailwind sees them.
 */

/** The card: a size container the rows below query. */
export const LIST_CONTAINER = "@container";

/**
 * Base (card under 680px): Item · Price · Status · menu.
 * @680: + Type and Channels. @900: + Availability. @1080: + Preparation (the board at 1144).
 */
export const LIST_COLS =
  "grid-cols-[minmax(96px,1fr)_80px_96px_24px] " +
  "@[680px]:grid-cols-[minmax(140px,1.35fr)_96px_minmax(80px,1.3fr)_90px_120px_24px] " +
  "@[900px]:grid-cols-[minmax(160px,1.35fr)_110px_minmax(80px,1.3fr)_90px_140px_130px_24px] " +
  "@[1080px]:grid-cols-[minmax(160px,1.35fr)_120px_minmax(80px,1.3fr)_90px_150px_120px_150px_24px]";

/** Type and Channels: from 680px of card. */
export const CELL_FROM_680 = "hidden @[680px]:block";
export const CELL_FROM_680_FLEX = "hidden @[680px]:flex";
/** Availability: from 900px of card. */
export const CELL_FROM_900 = "hidden @[900px]:block";
/** Preparation: from 1080px of card. */
export const CELL_FROM_1080 = "hidden @[1080px]:block";

/** Row padding (px-[18px] on ListHead/ListRow) and the grid gap (gap-[12px]). */
export const ROW_PADDING_X = 36;
export const GRID_GAP = 12;

/** One container tier: the width that switches it on and its track list. */
export type ColumnTier = { minWidth: number; template: string };

/** The tiers, read back out of {@link LIST_COLS} (so the test sums the classes that ship). */
export function columnTiers(cols: string = LIST_COLS): ColumnTier[] {
  const tiers: ColumnTier[] = [];
  for (const token of cols.split(/\s+/).filter(Boolean)) {
    const m = /^(?:@\[(\d+)px\]:)?grid-cols-\[(.+)\]$/.exec(token);
    if (!m) continue;
    tiers.push({ minWidth: m[1] ? Number(m[1]) : 0, template: m[2] });
  }
  return tiers;
}

/** The tracks of one `grid-cols-[a_b_c]` template. */
export function tracks(template: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of template) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "_" && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** A track's minimum in px: `90px` → 90, `minmax(140px,1.35fr)` → 140, a bare `fr` → 0. */
export function trackMinPx(track: string): number {
  const fixed = /^(\d+(?:\.\d+)?)px$/.exec(track);
  if (fixed) return Number(fixed[1]);
  const mm = /^minmax\((\d+(?:\.\d+)?)px,/.exec(track);
  if (mm) return Number(mm[1]);
  return 0;
}

/** The narrowest card a template fits in: track minimums + gaps + row padding. */
export function templateMinWidth(template: string): number {
  const t = tracks(template);
  return t.reduce((sum, tr) => sum + trackMinPx(tr), 0) + GRID_GAP * (t.length - 1) + ROW_PADDING_X;
}
