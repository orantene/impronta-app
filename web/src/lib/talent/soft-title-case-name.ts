/**
 * GRK-052: hub profiles were showing all-lowercase (or ALL-CAPS) stage names
 * as stored. Soft title-case only when the whole string is one case — leave
 * intentional mixed case (McDonald, iPhone) alone.
 */
export function softTitleCaseName(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letters) return s;
  const allLower = letters === letters.toLowerCase();
  const allUpper = letters === letters.toUpperCase();
  if (!allLower && !allUpper) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-zà-ÿ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
