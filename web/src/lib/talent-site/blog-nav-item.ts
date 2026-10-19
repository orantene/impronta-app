/**
 * Talent-site nav: the platform-added "Blog" entry (TUL-1003 / TUL-1006).
 *
 * The site nav is built from the talent's own pages. The Blog link is NOT a
 * page, so it is appended here, only when the site has at least one listable
 * post, and only in "host-root" addressing (the talent host serves `/blog`;
 * the `/t/site/<slug>` platform route has no blog). A talent page that is
 * itself slugged "blog" keeps its own entry. Pure; the cached existence check
 * lives in `lib/cms/blog-nav.ts`.
 */
import type { MaxSiteHrefMode, MaxSiteNavItem } from "./resolve-max-site-core";

export const BLOG_NAV_SLUG = "blog";
/** Same word in both languages (the Spanish site keeps "Blog"). */
export const BLOG_NAV_LABEL = "Blog";

export function withBlogNavItem(
  nav: readonly MaxSiteNavItem[],
  hasPosts: boolean,
  hrefMode: MaxSiteHrefMode,
): MaxSiteNavItem[] {
  if (!hasPosts || hrefMode !== "host-root" || nav.some((n) => n.slug === BLOG_NAV_SLUG)) return [...nav];
  return [...nav, { slug: BLOG_NAV_SLUG, label: BLOG_NAV_LABEL, isHome: false, reserved: true }];
}

/** `slice(0, max)`, but a reserved item is kept (it replaces the last ordinary one). */
export function capNavKeepingReserved<T extends { reserved?: boolean }>(nav: readonly T[], max: number): T[] {
  if (nav.length <= max) return [...nav];
  const reserved = nav.filter((n) => n.reserved);
  if (reserved.length === 0 || reserved.length >= max) return nav.slice(0, max);
  const ordinary = nav.filter((n) => !n.reserved).slice(0, max - reserved.length);
  return [...ordinary, ...reserved];
}
