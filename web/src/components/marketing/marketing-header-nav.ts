import { pathnameWithoutAnyLocalePrefix, withLocaleHref } from "@/i18n/pathnames";
import type { MarketingCopy } from "@/lib/marketing/copy";

/**
 * Nav model for the marketing header and its mobile menu. Split out of
 * `header.tsx` so the pure parts (href building, active-state matching) are
 * unit-testable and the component file stays under the max-lines cap.
 */

export type NavLeaf = { label: string; href: string; description?: string };
export type NavNode =
  | { kind: "link"; label: string; href: string }
  | { kind: "menu"; label: string; blurb: string; items: NavLeaf[] };

/**
 * Product-forward navigation. Three menus carry the whole story:
 *   Platform  → what Tulala is (flagship: one-click builder + booking messenger)
 *   Solutions → who it's for (talent / business / hubs / the hybrid)
 *   Discover  → the single browse surface (talent, agencies & hubs, network)
 * plus Pricing and Stories. Labels/descriptions come from the copy module
 * (per locale); hrefs are authored here in canonical unprefixed form.
 */
export const NAV_HREFS = {
  platform: ["/#builder", "/#messenger", "/network", "/integrations", "/how-it-works"],
  solutions: ["/operators", "/agencies", "/organizations", "/#stories"],
  discover: ["/directory", "/discover-agencies", "/network"],
};

/**
 * Hrefs are authored unprefixed (English canonical) and localized at render.
 * Without this, a visitor on `/es` was thrown back into the English tree the
 * moment they touched the nav: hreflang advertised `/es`, but every internal
 * link pointed at `/pricing`, `/#stories`, ... and the locale did not survive
 * the navigation. Bad for the reader and worse for crawlers, which follow
 * internal links to decide what the Spanish tree actually contains.
 */
export function buildNav(copy: MarketingCopy, locale: string): NavNode[] {
  const L = (href: string) => withLocaleHref(href, locale);
  const menu = (m: MarketingCopy["nav"]["platform"], hrefs: string[]): NavNode => ({
    kind: "menu",
    label: m.label,
    blurb: m.blurb,
    items: m.items.map((it, i) => ({
      label: it.label,
      description: it.description,
      href: L(hrefs[i]),
    })),
  });
  return [
    menu(copy.nav.platform, NAV_HREFS.platform),
    menu(copy.nav.solutions, NAV_HREFS.solutions),
    menu(copy.nav.discover, NAV_HREFS.discover),
    { kind: "link", label: copy.nav.pricing, href: L("/pricing") },
    { kind: "link", label: copy.nav.stories, href: L("/#stories") },
  ];
}

export function isActive(pathname: string, href: string) {
  const [rawBase, hash] = href.split("#");

  // A hash link ("/#stories") targets a section, not a page. Stripping the
  // hash and comparing what was left made `base` "/", so EVERY homepage visit
  // marked Stories as the current page: the underline made `/` look like it
  // had landed on Stories. A section link never owns the active state.
  if (hash) return false;

  // Compare locale-free forms on BOTH sides. Hrefs are now locale-prefixed
  // ("/es/pricing"), while `usePathname()` under the locale rewrite may report
  // either form — comparing them raw would drop the active state on every
  // Spanish page.
  const base = pathnameWithoutAnyLocalePrefix(rawBase || "/");
  const here = pathnameWithoutAnyLocalePrefix(pathname || "/");

  if (!base || base === "/") return here === "/";

  // Segment-aware: "/for" must not light up on "/format".
  return here === base || here.startsWith(`${base}/`);
}
