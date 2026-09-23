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

/**
 * DNS label shape — the SAME regex as the `talent_sites_site_slug_dns_label`
 * CHECK. Once a slug is a hostname label (`<slug>.tulala.digital`) it has to BE
 * one, so this is what every caller validates against before a write. Kept
 * literal here rather than imported so this module stays dependency-free.
 */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Is `value` a DNS label, and therefore usable as a site slug / subdomain? */
export function isDnsLabel(value: string | null | undefined): boolean {
  const candidate = (value ?? "").trim();
  return candidate.length > 0 && candidate.length <= 63 && DNS_LABEL.test(candidate);
}

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
  /**
   * Extra, caller-supplied "is this one taken?" test, applied to every candidate
   * alongside the `taken` set. The shared-namespace check (an agency slug, an
   * agency subdomain, a reserved label) cannot be expressed as a finite set, so
   * it arrives as a predicate. Pure + synchronous by design; the async, RPC-
   * backed form is {@link deriveAvailableSiteSlug}.
   */
  isTaken: (slug: string) => boolean = () => false,
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

  const unavailable = (candidate: string): boolean =>
    used.has(candidate) || !isDnsLabel(candidate) || isTaken(candidate);

  if (!unavailable(base)) return base;

  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    // Trim the base so base+suffix fits the length cap, then re-trim any
    // trailing hyphen the cut may have exposed.
    const trimmedBase = base
      .slice(0, MAX_SLUG_LEN - suffix.length)
      .replace(/-+$/g, "");
    const candidate = `${trimmedBase || FALLBACK_SLUG}${suffix}`;
    if (!unavailable(candidate)) return candidate;
  }

  // Pathological fallback — astronomically unlikely (10k collisions on one base).
  return `${base.slice(0, MAX_SLUG_LEN - 14)}-${Date.now().toString(36)}`;
}

/**
 * Async sibling of {@link deriveSiteSlug} for the callers whose availability
 * test is a database round-trip (`platform_subdomain_label_taken`).
 *
 * It walks the same candidate sequence — base, base-2, base-3, … — and asks
 * `isTaken` about each in turn, so the number of queries is one plus the number
 * of real collisions, not one per possible suffix. `isTaken` FAILING (throwing)
 * is treated as "taken" so a transient error can never hand out a slug the
 * namespace already owns; the DB triggers are the hard backstop either way.
 */
export async function deriveAvailableSiteSlug(
  displayName: string | null | undefined,
  profileCode: string | null | undefined,
  opts: {
    /** Slugs already known to be taken (e.g. other talent_sites rows). */
    taken?: Iterable<string>;
    /** Namespace check; defaults to "nothing else is taken". */
    isTaken?: (slug: string) => Promise<boolean> | boolean;
    /** How many candidates to try before falling back. */
    maxAttempts?: number;
  } = {},
): Promise<string> {
  const isTaken = opts.isTaken;
  const maxAttempts = opts.maxAttempts ?? 25;

  // Candidate n comes from the pure helper, with the previous candidates folded
  // into its `taken` set so it produces the next one in the sequence.
  const rejected = new Set<string>();
  for (const t of opts.taken ?? []) {
    const norm = (t ?? "").trim().toLowerCase();
    if (norm) rejected.add(norm);
  }

  let last = "";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = deriveSiteSlug(displayName, profileCode, rejected);
    if (candidate === last) break;
    last = candidate;
    if (!isTaken) return candidate;
    let taken: boolean;
    try {
      taken = await isTaken(candidate);
    } catch {
      taken = true;
    }
    if (!taken) return candidate;
    rejected.add(candidate);
  }

  // Every candidate we were willing to try is spoken for — fall back to a
  // time-suffixed slug, which the unique index + triggers still validate.
  const stamped = deriveSiteSlug(
    displayName,
    profileCode,
    rejected,
  ).slice(0, 40).replace(/-+$/g, "");
  return `${stamped || "site"}-${Date.now().toString(36)}`;
}
