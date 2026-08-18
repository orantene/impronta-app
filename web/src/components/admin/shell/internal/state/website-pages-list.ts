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

/**
 * The `cms_pages` slug as the DATABASE stores it, recovered from the
 * leading-slash form the shell renders.
 *
 * `mergeWebsiteStateFromBridge` prefixes every slug with `/` and rewrites the
 * empty homepage slug to `/`, so a row's `slug` is a display value, not a key.
 * `setPageRoleAction` and `quickRenamePageAction` both match on the RAW column,
 * where the homepage is the empty string — passing `/` there matches nothing
 * and the role assignment silently fails its "is this a real page?" check.
 */
export function rawPageSlug(slug: string): string {
  const key = normalizePageSlugKey(slug);
  return key === "/" ? "" : key.slice(1);
}

/**
 * One quick action offered on a page row.
 *
 * `restore` maps to publish, not to an un-archive: there is no draft-restore
 * operation anywhere in the server layer, and `publishPage` accepts an archived
 * row. Naming it `restore` rather than reusing `publish` keeps the two apart in
 * the copy, because they answer different questions.
 */
export type WebsitePageActionId =
  | "publish"
  | "rename"
  | "duplicate"
  | "setHomepage"
  | "archive"
  | "restore"
  | "delete";

/** Fixed presentation order, independent of which subset is permitted. */
const ACTION_ORDER: readonly WebsitePageActionId[] = [
  "publish",
  "restore",
  "rename",
  "duplicate",
  "setHomepage",
  "archive",
  "delete",
];

export type PageActionContext = {
  /** Role gate — below `admin` no page-changing affordance is offered. */
  readonly canEdit: boolean;
  /** The platform hub's own site is managed in code, not the page builder. */
  readonly isPlatformHub: boolean;
  /**
   * True when this page currently holds the `home` page role. Taken from the
   * GROUP rather than the row: the role is per-slug, so an EN row and its ES
   * sibling are the homepage together or not at all.
   */
  readonly isHomepage: boolean;
};

/**
 * True when `cms_pages.is_system_owned` is set for this row.
 *
 * The bridge does not project `is_system_owned` itself, but the M0 schema pairs
 * it with `system_template_key` (partial unique index
 * `WHERE is_system_owned = TRUE AND system_template_key IS NOT NULL`), and the
 * bridge DOES project the template key. A row with a template key is therefore
 * a row the `cms_pages` guard trigger refuses to DELETE and refuses to
 * re-slug — which is exactly the set of rows this list must not offer those
 * actions on. `undefined` means the payload predates the projection: unknown is
 * treated as "not system", because the server rejects the call anyway and its
 * message is the honest one to show.
 */
export function isSystemOwnedPage(row: WebsitePageRow): boolean {
  return typeof row.systemTemplateKey === "string" && row.systemTemplateKey !== "";
}

/**
 * Can this page's ADDRESS be changed?
 *
 * Two separate reasons it cannot, both of them real rather than defensive:
 *   • system-owned rows — the DB trigger rejects a slug update outright;
 *   • the homepage — its address is what `/` resolves to. `quickRename` does
 *     reconcile the role pointer, so a rename would not break the site, but a
 *     novice renaming "Home" to "welcome" and finding their front page now
 *     lives at /welcome is a surprise the list should not hand out.
 * The TITLE stays editable in both cases; only the address is frozen.
 */
export function isPageSlugLocked(
  row: WebsitePageRow,
  context: Pick<PageActionContext, "isHomepage">,
): boolean {
  return context.isHomepage || isSystemOwnedPage(row) || rawPageSlug(row.slug) === "";
}

/**
 * Which quick actions this page may offer, in presentation order.
 *
 * Every exclusion below mirrors something the SERVER already enforces, or a
 * one-way door a novice should not find behind a single click:
 *
 *   • not an admin, or the platform hub → nothing at all.
 *   • Publish only from draft/scheduled. Re-publishing a live page from a list
 *     row does nothing an operator can perceive.
 *   • Set as homepage only from PUBLISHED, and never on the current homepage.
 *     `setPageRoleAction` refuses an unpublished target ("That page must be
 *     published before it can take a role"), so offering it would be a button
 *     that always errors.
 *   • Archive never on the homepage (it takes `/` offline) and never on a
 *     system-owned row (`archivePage` returns SYSTEM_PAGE_IMMUTABLE).
 *   • Delete ONLY from archived, and never on the homepage or a system row.
 *     Live → Archive → Delete is the deliberate two-door path; `deletePage`
 *     itself would happily delete a live page in one call.
 */
export function derivePageActions(
  row: WebsitePageRow,
  context: PageActionContext,
): WebsitePageActionId[] {
  if (!context.canEdit || context.isPlatformHub) return [];

  const systemOwned = isSystemOwnedPage(row);
  const permitted = new Set<WebsitePageActionId>(["rename", "duplicate"]);

  if (row.status === "draft" || row.status === "scheduled") permitted.add("publish");
  if (row.status === "archived") permitted.add("restore");
  if (row.status === "published" && !context.isHomepage) permitted.add("setHomepage");
  if (
    (row.status === "published" || row.status === "draft") &&
    !context.isHomepage &&
    !systemOwned
  ) {
    permitted.add("archive");
  }
  if (row.status === "archived" && !context.isHomepage && !systemOwned) {
    permitted.add("delete");
  }

  return ACTION_ORDER.filter((id) => permitted.has(id));
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
