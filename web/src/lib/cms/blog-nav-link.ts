/**
 * Workspace public nav: append a "Blog" link when the site has a listable post.
 * Pure; the caller supplies the cached `hasPosts` answer and the resolved href.
 */
import type { PublicNavLink } from "@/lib/cms/public-navigation";

const BLOG_HREF = /(^|\/)blog\/?$/;

export function withBlogHeaderLink(
  links: readonly PublicNavLink[],
  hasPosts: boolean,
  href: string,
): PublicNavLink[] {
  if (!hasPosts || links.some((l) => BLOG_HREF.test(l.href.split("?")[0]))) return [...links];
  const last = links.reduce((max, l) => Math.max(max, l.sort_order), 0);
  return [...links, { label: "Blog", href, sort_order: last + 1 }];
}
