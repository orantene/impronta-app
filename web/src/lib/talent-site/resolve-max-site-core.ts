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
 * Inject the site's pages as the nav links of every `nav` node in the shell
 * tree, recursively. The default shell (`buildDefaultShellTree`) seeds a single
 * "Home" link; this replaces it with the LIVE page set so a multi-page site's
 * header reflects the talent's pages without the talent hand-maintaining links.
 *
 * PURE + non-mutating — returns a new tree (structural clone of the touched
 * branches). A shell with no `nav` node is returned unchanged. When the site has
 * no published pages, the nav's existing links are preserved (never blanked).
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

  const visit = (node: BuilderNode): BuilderNode => {
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
