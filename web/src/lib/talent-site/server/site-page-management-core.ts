/**
 * Talent Max Site — PURE page-management decisions (no runtime imports at load).
 *
 * The multi-page builder lets a Max talent ADD / RENAME / DELETE / REORDER /
 * SET-HOME the pages of their site (`talent_pages` rows). The DB enforces the
 * hard invariants — `(talent_profile_id, slug)` is unique, and the partial index
 * `talent_pages_one_home_per_profile` allows exactly one `is_home=true` row per
 * talent. This module holds the pure decisions the server actions make BEFORE
 * touching the DB, so they can be unit-tested with plain data:
 *
 *   a) slugifying + de-duplicating a NEW page slug against the talent's existing
 *      pages (so the unique index never rejects the insert),
 *   b) the next `sort_order` for an appended page,
 *   c) the reorder plan — given a desired ordering of page ids, the
 *      `(id, sort_order)` pairs to persist, and
 *   d) the "set home" plan — which rows flip `is_home` on/off so the partial
 *      unique index is satisfied in a single, conflict-free update batch.
 *
 * Mirrors `derive-site-slug.ts` (pure, unit-tested) — no I/O here.
 */

/** Reserved page slugs the talent can't take (would shadow site-level routes). */
export const RESERVED_PAGE_SLUGS: readonly string[] = ["site", "__site_shell__"];

/** A reasonable cap so a page slug never blows out a URL or an index entry. */
const MAX_PAGE_SLUG_LEN = 48;

/** Fallback when slugification yields nothing usable. */
const FALLBACK_PAGE_SLUG = "page";

/**
 * Slugify a free-text page title/label into a lowercase, hyphenated, URL-safe
 * slug. NFKD-folds accents to ASCII, collapses non-alphanumerics to single
 * hyphens, trims, and caps the length. Returns "" when nothing usable remains
 * (caller decides the fallback). Identical algorithm to `slugifySiteName`, kept
 * separate so the page cap can diverge from the site-slug cap independently.
 */
export function slugifyPageName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_PAGE_SLUG_LEN)
    .replace(/-+$/g, "");
}

/**
 * Derive a UNIQUE, non-reserved page slug for a new page.
 *
 * @param desired  Free-text the talent typed (title / nav label / explicit slug).
 * @param taken    Slugs already used by THIS talent's pages (lowercased).
 *
 * De-dupe rule: append "-2", "-3", … on collision (NOT "-1"), fitting the
 * numeric suffix inside the length cap. Reserved slugs are treated as taken.
 */
export function derivePageSlug(
  desired: string | null | undefined,
  taken: Iterable<string> = [],
): string {
  const base = slugifyPageName(desired ?? "") || FALLBACK_PAGE_SLUG;

  const used = new Set<string>();
  for (const t of taken) {
    const norm = (t ?? "").trim().toLowerCase();
    if (norm) used.add(norm);
  }
  for (const r of RESERVED_PAGE_SLUGS) used.add(r);

  if (!used.has(base)) return base;

  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const trimmedBase = base
      .slice(0, MAX_PAGE_SLUG_LEN - suffix.length)
      .replace(/-+$/g, "");
    const candidate = `${trimmedBase || FALLBACK_PAGE_SLUG}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${base.slice(0, MAX_PAGE_SLUG_LEN - 14)}-${Date.now().toString(36)}`;
}

/** True when `slug` is a reserved page slug (case-insensitive). */
export function isReservedPageSlug(slug: string): boolean {
  return RESERVED_PAGE_SLUGS.includes(slug.trim().toLowerCase());
}

/** Minimal page shape the pure planners need. */
export interface ManagedPage {
  id: string;
  sortOrder: number;
  isHome: boolean;
}

/**
 * The next `sort_order` for a page appended to the end of the list: one past the
 * current maximum (0 when the list is empty). Negative orders are clamped to 0.
 */
export function nextSortOrder(pages: readonly ManagedPage[]): number {
  if (pages.length === 0) return 0;
  const max = pages.reduce((m, p) => Math.max(m, p.sortOrder), 0);
  return max + 1;
}

/**
 * Build the reorder plan: given the DESIRED ordering of page ids, return the
 * `(id, sortOrder)` pairs to persist (0-based, dense). Ids not present in
 * `pages` are dropped; pages omitted from `orderedIds` are appended in their
 * existing relative order so a partial reorder never loses a page.
 *
 * Pure — returns ONLY the rows whose sort_order actually changes, so the caller
 * issues the minimum number of updates.
 */
export function planReorder(
  pages: readonly ManagedPage[],
  orderedIds: readonly string[],
): { id: string; sortOrder: number }[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const finalOrder: ManagedPage[] = [];

  for (const id of orderedIds) {
    const page = byId.get(id);
    if (page && !seen.has(id)) {
      finalOrder.push(page);
      seen.add(id);
    }
  }
  // Append any pages the caller didn't mention, preserving their current order.
  for (const page of [...pages].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!seen.has(page.id)) {
      finalOrder.push(page);
      seen.add(page.id);
    }
  }

  const changes: { id: string; sortOrder: number }[] = [];
  finalOrder.forEach((page, index) => {
    if (page.sortOrder !== index) changes.push({ id: page.id, sortOrder: index });
  });
  return changes;
}

/**
 * Build the "set home" plan: make `targetId` the sole `is_home=true` page.
 *
 * Returns the rows whose `is_home` flag must change:
 *   - the CURRENT home (if any, and not the target) → `isHome: false`,
 *   - the target → `isHome: true` (only if it isn't already home).
 *
 * The caller MUST apply the `false` flips BEFORE the `true` flip so the partial
 * unique index (`one_home_per_profile`) never sees two home rows mid-batch. The
 * returned array is ordered that way (clears first, then the set).
 *
 * Returns `null` when `targetId` is not a known page (caller errors out), or an
 * empty array when the target is already the sole home (a no-op).
 */
export function planSetHome(
  pages: readonly ManagedPage[],
  targetId: string,
): { id: string; isHome: boolean }[] | null {
  const target = pages.find((p) => p.id === targetId);
  if (!target) return null;

  const changes: { id: string; isHome: boolean }[] = [];
  // Clear every currently-home row that isn't the target FIRST.
  for (const p of pages) {
    if (p.isHome && p.id !== targetId) {
      changes.push({ id: p.id, isHome: false });
    }
  }
  // Then set the target (skip if already home).
  if (!target.isHome) {
    changes.push({ id: targetId, isHome: true });
  }
  return changes;
}

/**
 * Decide whether a page may be DELETED. The home page can't be deleted while
 * other pages exist (the site would lose its landing page); the talent must
 * re-home another page first. Deleting the LAST remaining page is allowed (the
 * site falls back to its starter/empty state on next provision).
 */
export function canDeletePage(
  pages: readonly ManagedPage[],
  targetId: string,
): { ok: true } | { ok: false; reason: "home_with_siblings" | "not_found" } {
  const target = pages.find((p) => p.id === targetId);
  if (!target) return { ok: false, reason: "not_found" };
  if (target.isHome && pages.length > 1) {
    return { ok: false, reason: "home_with_siblings" };
  }
  return { ok: true };
}
