/**
 * website-pages-list.ts — the pure half of the admin Website → Pages list.
 *
 * WHY THIS IS ITS OWN MODULE
 * ──────────────────────────
 * The Pages surface used to be a card grid: one card per `cms_pages` row, no
 * notion of the locale dimension. `cms_pages` is unique on
 * `(tenant_id, locale, slug)`, so a bilingual tenant gets TWO rows for the same
 * page and the grid showed them as two unrelated pages sitting next to each
 * other. Grouping is therefore not cosmetic — it is the difference between
 * "Contact (x2)" and "Contact, available in EN and ES".
 *
 * Everything here is pure and free of any `../state` runtime import (the state
 * barrel transitively reaches `server-only`, which throws under the
 * `tsx --test` lanes). Type-only imports are erased before the test lane
 * resolves anything, so these rules can carry real unit tests — see
 * `website-pages-list.test.ts`, registered in `test:builder-capabilities:a`.
 */

import type { WebsitePageRow } from "./types";

/**
 * One page as the operator thinks of it: a slug, plus every locale variant of
 * that slug that exists in `cms_pages`.
 */
export type WebsitePageGroup = {
  /** Normalized slug, always leading-slash and never trailing-slash. */
  readonly slug: string;
  /** The variant whose fields the collapsed row displays. */
  readonly primary: WebsitePageRow;
  /** Every variant of this slug, default locale first then locale A-Z. */
  readonly variants: readonly WebsitePageRow[];
  /** Distinct locales present, in `variants` order. */
  readonly locales: readonly string[];
  /** True when ANY variant is the tenant's homepage. */
  readonly isHomepage: boolean;
  /** The primary variant's status — what the collapsed row's chip shows. */
  readonly status: WebsitePageRow["status"];
};

/**
 * Sort precedence between statuses. Homepage jumps the queue entirely (handled
 * in `sortPageGroups`); everything else follows "what is live, what is about to
 * be live, what I am still writing, what I put away".
 */
const STATUS_RANK: Record<WebsitePageRow["status"], number> = {
  published: 0,
  scheduled: 1,
  draft: 2,
  archived: 3,
};

/**
 * `""`, `"/"`, `"about"`, `"/about"` and `"/about/"` are the same page as far
 * as an operator is concerned; `cms_pages` is not always consistent about the
 * leading slash. Normalizing here is what makes the EN and ES rows of one page
 * land in the same bucket.
 */
export function normalizePageSlugKey(slug: string): string {
  const trimmed = slug.trim();
  const inner = trimmed.replace(/^\/+/u, "").replace(/\/+$/u, "");
  return inner === "" ? "/" : `/${inner}`;
}

/** A row's locale, with the tenant default standing in for a row that has none. */
function localeOf(row: WebsitePageRow, defaultLocale: string): string {
  const raw = (row.locale ?? "").trim();
  return raw === "" ? defaultLocale : raw;
}

/** Epoch ms for an ISO timestamp, or `fallback` when it is absent/unparseable. */
function timeOf(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : fallback;
}

/**
 * Group `cms_pages` rows into one entry per slug.
 *
 * The group's display fields come from the DEFAULT-LOCALE variant, falling back
 * to the first variant when the tenant has no row at its own default locale
 * (which happens: a page can be authored in ES only). Input order is preserved
 * between groups — `sortPageGroups` owns the ordering decision.
 */
export function groupPagesBySlug(
  rows: readonly WebsitePageRow[],
  defaultLocale = "en",
): WebsitePageGroup[] {
  const buckets = new Map<string, WebsitePageRow[]>();
  const order: string[] = [];

  for (const row of rows) {
    const key = normalizePageSlugKey(row.slug);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(row);
      continue;
    }
    buckets.set(key, [row]);
    order.push(key);
  }

  const groups: WebsitePageGroup[] = [];
  for (const key of order) {
    const rawVariants = buckets.get(key) ?? [];
    if (rawVariants.length === 0) continue;
    const variants = [...rawVariants].sort((a, b) => {
      const la = localeOf(a, defaultLocale);
      const lb = localeOf(b, defaultLocale);
      if (la === lb) return 0;
      if (la === defaultLocale) return -1;
      if (lb === defaultLocale) return 1;
      return la.localeCompare(lb);
    });
    const primary =
      variants.find((v) => localeOf(v, defaultLocale) === defaultLocale) ??
      variants[0]!;
    const locales: string[] = [];
    for (const variant of variants) {
      const loc = localeOf(variant, defaultLocale);
      if (!locales.includes(loc)) locales.push(loc);
    }
    groups.push({
      slug: key,
      primary,
      variants,
      locales,
      isHomepage: variants.some((v) => v.isHomepage === true),
      status: primary.status,
    });
  }
  return groups;
}

/**
 * The fixed reading order of the list.
 *
 * Homepage first (it is the page every operator means when they say "my site"),
 * then Live A-Z, then Scheduled soonest-first, then Drafts most-recently-edited
 * first, then Archived last. There is no drag-and-drop because `cms_pages` has
 * no order column — navigation order is edited on the Navigation surface, and
 * pretending otherwise here would invent a persistence that does not exist.
 */
export function sortPageGroups(
  groups: readonly WebsitePageGroup[],
): WebsitePageGroup[] {
  return [...groups].sort((a, b) => {
    if (a.isHomepage !== b.isHomepage) return a.isHomepage ? -1 : 1;

    const rankDelta = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rankDelta !== 0) return rankDelta;

    if (a.status === "published") {
      const byTitle = a.primary.title.localeCompare(b.primary.title);
      if (byTitle !== 0) return byTitle;
    } else if (a.status === "scheduled") {
      // Soonest first; a scheduled row with no fire time sorts last rather
      // than pretending to be imminent.
      const sa = timeOf(a.primary.scheduledFor, Number.POSITIVE_INFINITY);
      const sb = timeOf(b.primary.scheduledFor, Number.POSITIVE_INFINITY);
      if (sa !== sb) return sa - sb;
    } else {
      // Drafts and archived — most recently edited first.
      const ua = timeOf(a.primary.updatedAt, 0);
      const ub = timeOf(b.primary.updatedAt, 0);
      if (ua !== ub) return ub - ua;
    }

    return a.slug.localeCompare(b.slug);
  });
}

/**
 * Does this group belong under a status filter tab?
 *
 * ANY variant counts, not just the primary. A page whose EN half is live and
 * whose ES half is still a draft genuinely belongs under both tabs — filtering
 * on the primary alone would hide the unfinished half, which is exactly the
 * half the operator opened the Draft tab to find.
 */
export function pageGroupMatchesStatus(
  group: WebsitePageGroup,
  status: WebsitePageRow["status"],
): boolean {
  return group.variants.some((v) => v.status === status);
}

/** Which search-visibility fact a note reports. */
export type PageVisibilityNoteId = "noindex" | "sitemap" | "metaDescription";

/**
 * A single search-visibility FACT about a page. Not an error, not a warning —
 * `noindex` is frequently deliberate. The UI states what is true and links to
 * the control that changes it; it does not scold.
 */
export type PageVisibilityNote = {
  readonly id: PageVisibilityNoteId;
  /** Catalog key for the plain-English sentence. Never an English string. */
  readonly messageKey: string;
};

/**
 * The three search-visibility facts, derived from P1-B's `cms_pages`
 * enrichment.
 *
 * Each flag is reported only when it is EXPLICITLY known: `undefined` means the
 * pipeline did not carry the field (mock mode, an older bridge payload), and
 * asserting "not listed in your sitemap" from an absent field would be a
 * fabricated fact. Same null-honesty rule the visit counts follow.
 */
export function derivePageVisibilityNotes(
  row: WebsitePageRow,
): PageVisibilityNote[] {
  const notes: PageVisibilityNote[] = [];
  if (row.noindex === true) {
    notes.push({ id: "noindex", messageKey: "dashboard.adminWebsite.pagesListNoindex" });
  }
  if (row.includeInSitemap === false) {
    notes.push({ id: "sitemap", messageKey: "dashboard.adminWebsite.pagesListNotInSitemap" });
  }
  if (row.hasMetaDescription === false) {
    notes.push({ id: "metaDescription", messageKey: "dashboard.adminWebsite.pagesListNoMetaDescription" });
  }
  return notes;
}
