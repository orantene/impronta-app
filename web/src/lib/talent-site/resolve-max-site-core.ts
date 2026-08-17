/**
 * Talent Max Site — PURE resolution + gating core (no runtime imports at load).
 *
 * The Talent Max Site is a talent-owned, multi-page website rendered at
 * `/t/site/<siteSlug>` (and at a custom domain by a sibling). It is SEPARATE
 * from the `/t/[code]` discovery profile. This module holds the pure decisions
 * the server render path needs, so they can be unit-tested with plain data
 * without pulling the Supabase / Next.js server graph:
 *
 *   a) the read-time PLAN GATE — the public site serves ONLY when the site is
 *      published AND the talent currently has Max (a lapsed plan stops serving),
 *   b) the PAGE selection — pick the home page (is_home) for a bare site URL, or
 *      the page whose `slug` matches `pageSlug`, with the published-status gate
 *      (defense-in-depth; anon RLS already hides drafts), and
 *   c) the NAV model — the ordered list of pages a visitor can navigate to, and
 *      injecting those links into any `nav` node in the shell tree.
 *
 * The pure factory pattern mirrors `published-talent-page-core.ts` + the
 * `plan-permits-snapshot.ts` gate (which we reuse for the snapshot path).
 */

import type { BuilderNode, BuilderNavLink } from "@/lib/site-admin/builder-node/types";

/** Effective tier for the gate. `talent_portfolio` is the Max plan key. */
export const TALENT_MAX_PLAN_KEY = "talent_portfolio";

/** Minimal `talent_sites` row the Max-site render path reads. */
export interface MaxSiteRow {
  talentProfileId: string;
  siteSlug: string | null;
  /** DRAFT shell tree (header/footer/logo). Served only in owner draft preview. */
  shellTree: unknown;
  /** PUBLISHED shell tree. Served to the public. NULL until the site publishes. */
  shellPublished: unknown;
  logoUrl: string | null;
  /** Set when the multi-page SITE was published. NULL → the site is not live. */
  sitePublishedAt: string | null;
}

/** Minimal `talent_pages` row for a site page. */
export interface MaxSitePageRow {
  id: string;
  slug: string;
  title: string;
  navLabel: string | null;
  status: "draft" | "scheduled" | "published" | string;
  isHome: boolean;
  sortOrder: number;
  blocks: unknown;
  theme: unknown;
  // SEO-2 — per-page SEO columns (SEO-1 migration; all nullable, degrade-safe).
  /** SEO-3 — SERP/tab title override. NULL -> fall back to `title`. */
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  noindex: boolean | null;
  jsonLd: unknown;
}

/** A nav entry the visitor sees — one per published page of the site. */
export interface MaxSiteNavItem {
  /** The page slug; the home page also carries `isHome`. */
  slug: string;
  label: string;
  isHome: boolean;
}

/**
 * Read-time PLAN + PUBLISH gate for the PUBLIC Max site.
 *
 * The public site renders only when:
 *   - the site has been published (`sitePublishedAt` is set), AND
 *   - the talent currently holds the Max plan (`talent_portfolio`).
 *
 * A lapsed-plan talent (Max trial → Pro/Free) stops serving the premium site
 * — mirroring `planPermitsPublishedTalentSite` (the snapshot-path gate). The
 * stored rows are never mutated, so the site returns the instant the plan is
 * restored. Owner draft preview bypasses this (the owner sees their unpublished
 * draft); pass `isOwnerDraftPreview: true` there.
 *
 * Pure — fails CLOSED for the public path on a missing plan key (we cannot
 * confirm Max → do not serve), so the caller MUST pass a resolved plan key for
 * the public render. The caller's plan read fails OPEN to null only when it
 * could not be loaded at all; the server render maps a closed gate to 404.
 */
export function maxSitePublicGate(input: {
  sitePublishedAt: string | null;
  planKey: string | null | undefined;
  isOwnerDraftPreview?: boolean;
}): boolean {
  if (input.isOwnerDraftPreview) return true;
  if (!input.sitePublishedAt) return false;
  return input.planKey === TALENT_MAX_PLAN_KEY;
}

/**
 * Pick the page a request resolves to.
 *
 *   - `pageSlug` omitted (a bare `/t/site/<slug>`)  → the home page (is_home).
 *   - `pageSlug` given                              → the page whose slug matches.
 *
 * `requirePublished` (the public path) drops any non-`published` page as
 * defense-in-depth — anon RLS already hides drafts, but an owner-scoped draft
 * read must keep them when previewing, so the flag is false there.
 *
 * Returns null when no matching page exists (→ 404 upstream).
 */
export function selectMaxSitePage(
  pages: readonly MaxSitePageRow[],
  opts: { pageSlug?: string | null; requirePublished: boolean },
): MaxSitePageRow | null {
  const slug = opts.pageSlug?.trim() || null;
  const candidates = opts.requirePublished
    ? pages.filter((p) => p.status === "published")
    : pages;

  if (!slug) {
    // Bare site URL → the home page. Fall back to the lowest-sort page when no
    // row is explicitly flagged is_home (a site always has a landing page).
    const home = candidates.find((p) => p.isHome);
    if (home) return home;
    const sorted = [...candidates].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug),
    );
    return sorted[0] ?? null;
  }

  return candidates.find((p) => p.slug === slug) ?? null;
}

/**
 * Build the ordered nav model from the site's pages — published pages only,
 * ordered by `sortOrder` then slug, each labelled by `nav_label` (falling back
 * to `title`, then `slug`). The home page is included so the brand/home link
 * and an explicit "Home" item both resolve.
 */
export function buildMaxSiteNav(
  pages: readonly MaxSitePageRow[],
): MaxSiteNavItem[] {
  return pages
    .filter((p) => p.status === "published")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
    .map((p) => ({
      slug: p.slug,
      label: p.navLabel?.trim() || p.title?.trim() || p.slug,
      isHome: p.isHome,
    }));
}

/**
 * The public href for a page within a site (home → the bare site URL).
 * `publicPathPrefix` carries the locale prefix (e.g. "/es") when set.
 */
export function maxSitePageHref(
  siteSlug: string,
  item: Pick<MaxSiteNavItem, "slug" | "isHome">,
  publicPathPrefix = "",
): string {
  const base = `${publicPathPrefix}/t/site/${encodeURIComponent(siteSlug)}`;
  return item.isHome ? base : `${base}/${encodeURIComponent(item.slug)}`;
}

/**
 * SEO-3 — resolve the two DISTINCT titles a site page has. Pure (no React), so
 * `render-max-site.tsx` can fold `meta_title` in without the logic becoming
 * untestable behind a server component.
 *
 * - `pageTitle` — what the page is called. Used for the JSON-LD `name` fallback,
 *   which describes a PERSON: a SERP string like "Actor in Madrid | Hire" is not
 *   a name, so the SEO override must never leak into it.
 * - `seoTitle` — the SERP/tab title: `meta_title || title`, the platform-wide
 *   convention (see app/page.tsx). This is what lands in `MaxSiteSeo.title`, and
 *   therefore also what og:title falls back to. A NULL/blank `meta_title` leaves
 *   the rendered <title> exactly as it was before the column existed.
 */
export function resolveMaxSiteTitles(
  page: Pick<MaxSitePageRow, "title" | "metaTitle">,
  fallback = "",
): { pageTitle: string; seoTitle: string } {
  const pageTitle = page.title?.trim() || fallback;
  return { pageTitle, seoTitle: page.metaTitle?.trim() || pageTitle };
}

/**
 * WF-5 — the `site_header` section schema caps `navItems` at 8 and requires each
 * label to be 1..60 chars. This MATTERS: `render-max-site.tsx` `safeParse`s the
 * header config and returns **null for the whole header** when it fails, so
 * emitting a 9th page (or a 61-char title) would not degrade the nav — it would
 * delete the header. Kept as a local constant because this module is a PURE core
 * with no runtime imports; `max-site-shell-nav.test.ts` asserts what we emit
 * actually passes the REAL schema, so the two cannot drift apart silently.
 */
const SITE_HEADER_MAX_NAV_ITEMS = 8;
const SITE_HEADER_MAX_NAV_LABEL = 60;

/**
 * Inject the site's pages as the nav links of the shell header, recursively.
 * The default shell seeds a single "Home" link; this replaces it with the LIVE
 * page set so a multi-page site's header reflects the talent's pages without the
 * talent hand-maintaining links.
 *
 * TWO header shapes are hydrated, because the shell was refactored underneath
 * this function and it silently stopped working:
 *
 *  1. a `nav` BUILDER NODE (`props.links`) — the original shape, still valid for
 *     hand-built or legacy shells; and
 *  2. a `site_header` SECTION LANDMARK, which carries its config inline on
 *     `props.sectionProps` (`navItems` + `brand.href`) and has NO `nav` child.
 *     This is what `buildDefaultShellTree` emits today — its WF-5
 *     `regions.center: [{ type: "nav" }]` entry REFERENCES `navItems` rather
 *     than holding links itself. Walking only for `kind === "nav"` matched
 *     nothing here, so every multi-page talent Max site rendered a header
 *     containing just the seeded "Home".
 *
 * PURE + non-mutating — returns a new tree (structural clone of the touched
 * branches). A shell with neither shape is returned unchanged. When the site has
 * no published pages, existing links are preserved (never blanked).
 */
export function hydrateShellNav(
  tree: readonly BuilderNode[],
  nav: readonly MaxSiteNavItem[],
  siteSlug: string,
  publicPathPrefix = "",
): BuilderNode[] {
  if (nav.length === 0) return tree.slice();

  const links: BuilderNavLink[] = nav.map((item) => ({
    id: `maxsite-nav-${item.slug}`,
    label: item.label,
    href: maxSitePageHref(siteSlug, item, publicPathPrefix),
  }));

  const home = nav.find((n) => n.isHome) ?? nav[0]!;
  const brandHref = maxSitePageHref(siteSlug, home, publicPathPrefix);

  // The `site_header` config shape: schema-legal `{label, href}` pairs, capped
  // and truncated so `safeParse` can never reject the header (see the constants
  // above). `links` above is the richer builder-node shape and is left uncapped.
  const navItems = nav
    .slice(0, SITE_HEADER_MAX_NAV_ITEMS)
    .map((item) => ({
      label: item.label.slice(0, SITE_HEADER_MAX_NAV_LABEL),
      href: maxSitePageHref(siteSlug, item, publicPathPrefix),
    }))
    // A blank label fails the schema's `min(1)`; buildMaxSiteNav already falls
    // back to the slug, so this only guards a hand-edited row.
    .filter((item) => item.label.length > 0);

  const visit = (node: BuilderNode): BuilderNode => {
    // Shape 2 — the `site_header` SECTION landmark (config inline, no nav child).
    if (node.kind === "section" && node.props.sectionTypeKey === "site_header") {
      // Nothing schema-legal to write → leave the seeded nav alone rather than
      // blanking a header that currently renders.
      if (navItems.length === 0) return node;
      const cfg = node.props.sectionProps ?? {};
      const brand = (cfg.brand ?? {}) as Record<string, unknown>;
      // Spread `node.props` (not a widened Record) so `sectionTypeKey` and the
      // rest of the section envelope survive — the compiler enforces it.
      return {
        ...node,
        props: {
          ...node.props,
          sectionProps: {
            ...cfg,
            navItems,
            // The brand always links to the SITE home, never the seeded "/".
            brand: { ...brand, href: brandHref },
          },
        },
      };
    }
    // Shape 1 — a plain `nav` builder node.
    if (node.kind === "nav") {
      // The brand always links to the SITE home. The default shell seeds a
      // placeholder "/" brandHref; a multi-page site's brand must resolve to
      // the site's own home URL, so we always set it here.
      return {
        ...node,
        props: {
          ...node.props,
          brandHref,
          links,
        },
      } as BuilderNode;
    }
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children) && children.length > 0) {
      return { ...node, children: children.map(visit) } as BuilderNode;
    }
    return node;
  };

  return tree.map(visit);
}

/**
 * Coerce a persisted jsonb tree (shell_tree / shell_published / blocks) into a
 * `BuilderNode[]`. Anything that is not a JSON array degrades to an empty tree
 * so a render paints nothing rather than throwing (degrade safe).
 */
export function coerceTree(value: unknown): BuilderNode[] {
  return Array.isArray(value) ? (value as BuilderNode[]) : [];
}
