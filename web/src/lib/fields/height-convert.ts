// height-convert.ts — pure cm ⇄ ft/in conversion for the single canonical
// "Height" field. The stored value is always centimetres (integer); ft/in is
// a live-converted input convenience, never persisted on its own. Kept
// React-free so it is unit-testable and reusable (editor control + any future
// public-profile / card display).

export const CM_PER_INCH = 2.54;

/** Field key of the single canonical body-height field (centimetres). */
export const HEIGHT_CM_FIELD_KEY = "physical.height_cm";

/**
 * Plausible human-height window, in centimetres. Deliberately WIDER than any
 * realistic roster (shortest/tallest recorded adults sit inside it) — this is
 * a garbage filter, not a casting rule.
 *
 * Why it exists: `height_cm` is a free numeric input, and a talent who typed
 * their height in metres ("2") or fat-fingered a digit used to render as a
 * literal "2 cm" on their public directory card. A nonsense measurement on a
 * talent card reads as a broken product to the client browsing it, so the
 * display layer suppresses the line rather than publishing the bad value.
 */
export const HEIGHT_CM_MIN = 90;
export const HEIGHT_CM_MAX = 250;

/** True when `cm` is a finite number inside the plausible-height window. */
export function isPlausibleHeightCm(cm: unknown): boolean {
  const n = Number(cm);
  return Number.isFinite(n) && n >= HEIGHT_CM_MIN && n <= HEIGHT_CM_MAX;
}

/** Centimetres → whole feet + whole inches (inches rounded, carries to feet). */
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalInches = cm / CM_PER_INCH;
  let ft = Math.floor(totalInches / 12);
  let inch = Math.round(totalInches - ft * 12);
  if (inch >= 12) {
    ft += 1;
    inch -= 12;
  }
  if (ft < 0) {
    ft = 0;
    inch = 0;
  }
  return { ft, inch };
}

/** Whole feet + inches → centimetres (rounded to the nearest cm). */
export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * CM_PER_INCH);
}
