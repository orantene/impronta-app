/**
 * Guest phone helpers for the booking sheet (TUL-897 / TUL-923 / TUL-929).
 * Pure so the rules are tested without a DOM.
 */

/** TUL-897: a phone is digits, one leading "+", and spaces. Everything else is dropped as typed. */
export function sanitizeGuestPhone(raw: string): string {
  const kept = raw.replace(/[-.()/]/g, " ").replace(/[^\d+ ]/g, "");
  const lead = kept.trimStart().startsWith("+") ? "+" : "";
  return lead + kept.replace(/\+/g, "").replace(/ {2,}/g, " ").replace(/^ +/, "").replace(/^\+ /, "+");
}
