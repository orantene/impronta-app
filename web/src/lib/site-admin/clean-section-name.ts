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
 */
export function cleanSectionName(raw: string | null | undefined): string {
  if (!raw) return "";
  return (
    raw
      .replace(/\s*\([^)]*starter[^)]*\)\s*/gi, "")
      .replace(/\s+[0-9a-f]{6,8}$/i, "")
      .trim() || raw.trim()
  );
}
