/**
 * slug-minting.ts — collision-safe slug and title minting for template
 * duplication (F1 fix) and import (A1/A4).
 *
 * All functions here are pure — no I/O.  The DB query that feeds
 * `existingSlugs` / `existingTitles` lives in the caller (duplicateTemplate,
 * importTemplate, etc.) so these helpers stay independently unit-testable.
 */

// ── Slug helpers ───────────────────────────────────────────────────────────────

/**
 * Strip any trailing `-copy` or `-copy-N` (N ≥ 2) suffix from a slug.
 *
 * Examples:
 *   "editorial-dark"         → "editorial-dark"
 *   "editorial-dark-copy"    → "editorial-dark"
 *   "editorial-dark-copy-2"  → "editorial-dark"
 *   "editorial-dark-copy-99" → "editorial-dark"
 */
export function stripCopySuffix(slug: string): string {
  return slug
    .replace(/-copy-\d+$/, "")
    .replace(/-copy$/, "");
}

/**
 * Mint the first free slug in the sequence `base-copy`, `base-copy-2`,
 * `base-copy-3`, … that is not present in `existingSlugs`.
 *
 * @param baseSlug     The raw slug of the source (may already end in -copy[-N];
 *                     the suffix is stripped before minting so duplicating a
 *                     copy of a copy doesn't accumulate suffixes).
 * @param existingSlugs  All slugs already taken for this `kind` (from DB).
 */
export function mintCopySlug(
  baseSlug: string,
  existingSlugs: ReadonlySet<string>,
): string {
  const base = stripCopySuffix(baseSlug.trim());

  const candidate1 = `${base}-copy`;
  if (!existingSlugs.has(candidate1)) return candidate1;

  for (let n = 2; n <= 999; n++) {
    const candidate = `${base}-copy-${n}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }

  // Astronomically unlikely — fall back to a timestamp suffix.
  return `${base}-copy-${Date.now()}`;
}

// ── Title helpers ──────────────────────────────────────────────────────────────

/**
 * Strip any trailing ` (Copy)` or ` (Copy N)` (N ≥ 2) suffix from a title.
 *
 * Examples:
 *   "Editorial Dark"          → "Editorial Dark"
 *   "Editorial Dark (Copy)"   → "Editorial Dark"
 *   "Editorial Dark (Copy 2)" → "Editorial Dark"
 */
export function stripCopyTitleSuffix(title: string): string {
  return title
    .replace(/\s+\(Copy \d+\)$/, "")
    .replace(/\s+\(Copy\)$/, "");
}

/**
 * Mint the first free title in the sequence `base (Copy)`, `base (Copy 2)`,
 * `base (Copy 3)`, … that is not present in `existingTitles`.
 *
 * Titles are compared case-insensitively so `"Hero (copy)"` and `"Hero (Copy)"`
 * are treated as the same occupied slot.
 *
 * @param baseTitle      The raw title of the source row.
 * @param existingTitles All titles already taken for this `kind` (from DB).
 */
export function mintCopyTitle(
  baseTitle: string,
  existingTitles: ReadonlySet<string>,
): string {
  const base = stripCopyTitleSuffix(baseTitle.trim());
  const lower = (s: string) => s.toLowerCase();
  const taken = new Set([...existingTitles].map(lower));

  const candidate1 = `${base} (Copy)`;
  if (!taken.has(lower(candidate1))) return candidate1;

  for (let n = 2; n <= 999; n++) {
    const candidate = `${base} (Copy ${n})`;
    if (!taken.has(lower(candidate))) return candidate;
  }

  return `${base} (Copy ${Date.now()})`;
}
