// height-convert.ts — pure cm ⇄ ft/in conversion for the single canonical
// "Height" field. The stored value is always centimetres (integer); ft/in is
// a live-converted input convenience, never persisted on its own. Kept
// React-free so it is unit-testable and reusable (editor control + any future
// public-profile / card display).

export const CM_PER_INCH = 2.54;

/** Field key of the single canonical body-height field (centimetres). */
export const HEIGHT_CM_FIELD_KEY = "physical.height_cm";

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
