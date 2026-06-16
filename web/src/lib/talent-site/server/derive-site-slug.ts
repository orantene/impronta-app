/**
 * Talent Max Site — slug derivation (PURE, unit-tested).
 *
 * Derives a URL-safe site slug from a talent's display name (fallback
 * profile code), then de-duplicates against the slugs already taken by other
 * sites. The globally-unique partial index on `talent_sites.site_slug` is the
 * hard backstop; this helper produces the candidate that satisfies it.
 *
 * No I/O — the caller supplies the set of taken slugs so this stays a pure,
 * testable function (mirrors the `slugifyCollectionKey` pattern but hyphenated
 * for a public URL path: /t/site/<slug>).
 */

/** A reasonable cap so a slug never blows out a URL or an index entry. */
const MAX_SLUG_LEN = 48;

/** Fallback when slugification yields nothing usable. */
const FALLBACK_SLUG = "site";

/**
 * Slugify a free-text label into a lowercase, hyphenated, URL-safe slug.
 * - Unicode-normalized (NFKD) so accented Latin folds to ASCII where possible.
 * - Non-alphanumerics collapse to single hyphens; leading/trailing trimmed.
 * - Capped to {@link MAX_SLUG_LEN}; trailing hyphen after the cut is trimmed.
 * Returns "" when the input has no usable characters (caller decides fallback).
 */
export function slugifySiteName(value: string): string {
  return value
    .normalize("NFKD")
    // Drop combining marks left by NFKD (é → e + ´ → e).
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, "");
}

/**
 * Derive a UNIQUE site slug for a talent.
 *
 * @param displayName  Preferred source (the talent's public display name).
 * @param profileCode  Fallback source when displayName slugifies to "".
 * @param taken        Slugs already in use by OTHER sites (lowercased). The
 *                     result is guaranteed not to be in this set.
 *
 * De-dupe rule: append "-2", "-3", … (NOT "-1") on collision, matching common
 * web slug conventions. The numeric suffix is fit within {@link MAX_SLUG_LEN}
 * by trimming the base when needed, so even a maxed-out base stays unique.
 */
export function deriveSiteSlug(
  displayName: string | null | undefined,
  profileCode: string | null | undefined,
  taken: Iterable<string> = [],
): string {
  const base =
    slugifySiteName(displayName ?? "") ||
    slugifySiteName(profileCode ?? "") ||
    FALLBACK_SLUG;

  const used = new Set<string>();
  for (const t of taken) {
    const norm = (t ?? "").trim().toLowerCase();
    if (norm) used.add(norm);
  }

  if (!used.has(base)) return base;

  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    // Trim the base so base+suffix fits the length cap, then re-trim any
    // trailing hyphen the cut may have exposed.
    const trimmedBase = base
      .slice(0, MAX_SLUG_LEN - suffix.length)
      .replace(/-+$/g, "");
    const candidate = `${trimmedBase || FALLBACK_SLUG}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  // Pathological fallback — astronomically unlikely (10k collisions on one base).
  return `${base.slice(0, MAX_SLUG_LEN - 14)}-${Date.now().toString(36)}`;
}
