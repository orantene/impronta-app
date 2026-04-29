/**
 * Strip seeder debug suffixes from stored section names.
 *
 * Seeded sections land in the DB with names like:
 *   "Hero — new (Classic starter) d7b14f"
 *
 * The "(Classic starter)" template label and the trailing git-sha-style
 * hex hash are internal scaffolding. Operators see cleaned names:
 *   "Hero — new"
 *
 * Usable from both server actions and client components (no side-effects,
 * no imports beyond the JS standard library).
 *
 * QA-3 fix (2026-04-29): the previous regex pair collapsed the
 * whitespace on BOTH sides of the parenthetical, so the input
 *   "Final CTA — new (Editorial starter) a27acf"
 * became
 *   "Final CTA — newa27acf"
 * after the first replace — and the second replace, which required
 * `\s+` before the hex, then failed to strip the suffix. The hex tail
 * stayed glued to "new" and surfaced in the navigator as "newa27acf",
 * "newd7b14f", "new26ea04" etc., which read as debug residue in the
 * builder. Now we replace the parenthetical with a single space and
 * collapse runs at the end so the hex suffix is reliably whitespace-
 * separated before the second regex runs.
 */
export function cleanSectionName(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw
    // Drop the "(Editorial starter)" / "(Classic starter)" template
    // label, replacing it with a single space so we don't fuse the
    // tokens on either side.
    .replace(/\s*\([^)]*starter[^)]*\)\s*/gi, " ")
    // Drop a trailing 6-8 char hex token. `\s*` (not `\s+`) is
    // intentional — it tolerates legacy DB rows where the seeder
    // concatenated the hex without a separator.
    .replace(/\s*[0-9a-f]{6,8}$/i, "")
    // Collapse whitespace runs created by the two replaces above.
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw.trim();
}
