import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Code2,
  FileText,
  Globe2,
  Inbox,
  Key,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Network,
  Newspaper,
  Palette,
  Search,
  Sparkles,
  Star,
  Users,
} from "lucide-react";

/**
 * Site control center — capability catalog.
 *
 * Single source of truth for the card grid on /admin/site. Each card belongs
 * to one of four plan tiers. The page renders tier bands top-to-bottom in
 * order; cards above the active plan render unlocked, cards below render
 * locked with conversion-hook copy.
 *
 * Order matters: tiers are PLAN_ORDER; within a tier, the first card is the
 * one we want users to land on first.
 *
 * Hrefs prefer existing /admin routes; surfaces that aren't built yet point
 * at /admin/site/<id> stub pages.
 */

export type Plan = "free" | "studio" | "agency" | "network";

export const PLAN_ORDER: Plan[] = ["free", "studio", "agency", "network"];

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

/** Palette per the mockup. Not part of the dashboard token set on purpose —
 *  these badges are the *only* place tier color leaks through, so we keep
 *  them inline and don't pollute the global theme. */
export const PLAN_COLOR: Record<Plan, { bg: string; fg: string }> = {
  free: { bg: "#eae7db", fg: "#0b0b0d" },
  studio: { bg: "#2a5fd1", fg: "#ffffff" },
  agency: { bg: "#8b6d1f", fg: "#ffffff" },
  network: { bg: "#146b3a", fg: "#ffffff" },
};

export type Capability = {
  id: string;
  /** Plan tier that unlocks this capability. */
  tier: Plan;
  label: string;
  /** Stat / status line shown when unlocked (e.g. "12 pages · 3 drafts"). */
  stat: string;
  /** Conversion-hook copy shown when locked (italic, tier-tinted). */
  lockedCopy: string;
  /** Existing admin route. If null, capability ships as a stub page. */
  href: string;
  icon: LucideIcon;
  /** Highlight icon (gold tint) — used sparingly for the "anchor" card per tier. */
  iconAccent?: boolean;
};

export type TierBand = {
  tier: Plan;
  /** Headline shown in the divider above the grid. */
  headline: string;
  /** One-sentence description. */
  helper: string;
  /** "Every plan" / "Studio" / "Agency" / "Network" badge label. */
  badgeLabel: string;
  /** Upgrade button copy — "Upgrade" for paid, "Contact" for Network. */
  ctaLabel: string;
  cards: Capability[];
};

const FREE_CARDS: Capability[] = [
  {
    id: "roster",
    tier: "free",
    label: "Roster",
    stat: "Talents · drafts · approvals",
    lockedCopy: "Manage every talent on your roster",
    href: "/admin/talent",
    icon: Users,
  },
  {
    id: "directory",
    tier: "free",
    label: "Directory settings",
    stat: "Grid · dedicated pages · 34 fields",
    lockedCopy: "Configure how your talents are discovered",
    href: "/admin/directory/filters",
    icon: LayoutGrid,
    iconAccent: true,
  },
  {
    id: "inquiries",
    tier: "free",
    label: "Inquiries",
    stat: "Open requests · in-progress · won",
    lockedCopy: "Receive booking requests through your site",
    href: "/admin/inquiries",
    icon: Inbox,
  },
  {
    id: "branding",
    tier: "free",
    label: "Branding",
    stat: "Logo · typography · brand color",
    lockedCopy: "Set your logo, colors, and typography",
    href: "/admin/site-settings/branding",
    icon: Sparkles,
  },
  {
    id: "activity",
    tier: "free",
    label: "Activity",
    stat: "Recent edits, publishes, and bookings",
    lockedCopy: "See what's changed across your workspace",
    href: "/admin/site-settings/audit",
    icon: Activity,
  },
];

const STUDIO_CARDS: Capability[] = [
  {
    id: "widgets",
    tier: "studio",
    label: "Widgets",
    stat: "Active embeds · views",
    lockedCopy: "Embed your roster anywhere — WordPress, Webflow, custom",
    href: "/admin/site/widgets",
    icon: LayoutDashboard,
  },
  {
    id: "api",
    tier: "studio",
    label: "API keys",
    stat: "Active keys · last used",
    lockedCopy: "Read-only JSON for partners and integrations",
    href: "/admin/site/api-keys",
    icon: Key,
  },
  {
    id: "domain",
    tier: "studio",
    label: "Domain & home",
    stat: "Subdomain · public home",
    lockedCopy: "A subdomain you can deep-link from anywhere",
    href: "/admin/site/domain",
    icon: Globe2,
  },
];

const AGENCY_CARDS: Capability[] = [
  {
    id: "homepage",
    tier: "agency",
    label: "Homepage",
    stat: "Published · draft pending",
    lockedCopy: "Your branded homepage on your domain",
    href: "/admin/site-settings/structure",
    icon: Star,
    iconAccent: true,
  },
  {
    id: "pages",
    tier: "agency",
    label: "Pages",
    stat: "Published pages · drafts",
    lockedCopy: "Build any page, any layout, on your domain",
    href: "/admin/site-settings/content/pages",
    icon: FileText,
    iconAccent: true,
  },
  {
    id: "posts",
    tier: "agency",
    label: "Posts",
    stat: "Editorial posts · drafts",
    lockedCopy: "Your editorial voice — articles, news, longform",
    href: "/admin/site-settings/content/posts",
    icon: Newspaper,
  },
  {
    id: "navigation",
    tier: "agency",
    label: "Navigation & footer",
    stat: "Header · footer columns",
    lockedCopy: "Drag-and-drop nav and footer per locale",
    href: "/admin/site-settings/content/navigation",
    icon: Menu,
  },
  {
    id: "theme",
    tier: "agency",
    label: "Theme & foundations",
    stat: "Active preset · token overrides",
    lockedCopy: "A library of designer kits and full token control",
    href: "/admin/site-settings/design",
    icon: Palette,
  },
  {
    id: "seo",
    tier: "agency",
    label: "SEO & defaults",
    stat: "Meta · sitemap · redirects",
    lockedCopy: "Full SEO stack on your custom domain",
    href: "/admin/site-settings/seo",
    icon: Search,
  },
];

const NETWORK_CARDS: Capability[] = [
  {
    id: "hub",
    tier: "network",
    label: "Hub publishing",
    stat: "Talents promoted to network discovery",
    lockedCopy: "Cross-agency discovery across the platform",
    href: "/admin/site/hub",
    icon: Network,
  },
  {
    id: "multiagency",
    tier: "network",
    label: "Multi-agency manager",
    stat: "Agencies · managers",
    lockedCopy: "Operate multiple brands from one workspace",
    href: "/admin/site/multi-agency",
    icon: Code2,
  },
];

export const TIER_BANDS: TierBand[] = [
  {
    tier: "free",
    headline: "Your core workspace",
    helper: "Free, Studio, Agency, Network — every plan starts here.",
    badgeLabel: "Every plan",
    ctaLabel: "",
    cards: FREE_CARDS,
  },
  {
    tier: "studio",
    headline: "Embed anywhere",
    helper: "Drop your roster into any site you already own.",
    badgeLabel: "Studio",
    ctaLabel: "Upgrade",
    cards: STUDIO_CARDS,
  },
  {
    tier: "agency",
    headline: "Full branded site",
    helper: "Your site, your domain, your brand. Pages, posts, nav, theme, SEO.",
    badgeLabel: "Agency",
    ctaLabel: "Upgrade",
    cards: AGENCY_CARDS,
  },
  {
    tier: "network",
    headline: "Multi-agency + hub",
    helper: "Operate multiple agencies and push talent to cross-agency discovery.",
    badgeLabel: "Network",
    ctaLabel: "Contact",
    cards: NETWORK_CARDS,
  },
];

export type ConversionHero = {
  fromPlan: Plan;
  toPlan: Plan;
  eyebrow: string;
  headline: string;
  body: string;
  primaryCta: string;
  secondaryCta: string;
  /** Three-stat strip below copy. */
  stats: { value: string; label: string }[];
};

const HERO_BY_PLAN: Record<Plan, ConversionHero | null> = {
  free: {
    fromPlan: "free",
    toPlan: "studio",
    eyebrow: "Studio · embed anywhere",
    headline: "Drop your roster into any site you already own",
    body: "WordPress, Webflow, Shopify — paste a snippet and your talent grid renders, branded and synced. No re-platforming.",
    primaryCta: "Upgrade to Studio",
    secondaryCta: "See how it works",
    stats: [
      { value: "3", label: "embed widgets" },
      { value: "1", label: "API key" },
      { value: "subdomain", label: "deep link" },
    ],
  },
  studio: {
    fromPlan: "studio",
    toPlan: "agency",
    eyebrow: "Agency · full branded site",
    headline: "Your domain. Your pages. Your brand.",
    body: "Move beyond embeds. Build the homepage, write posts, ship a custom theme, and own SEO on your own domain.",
    primaryCta: "Upgrade to Agency",
    secondaryCta: "Compare features",
    stats: [
      { value: "∞", label: "pages" },
      { value: "∞", label: "posts" },
      { value: "your", label: "domain" },
    ],
  },
  agency: {
    fromPlan: "agency",
    toPlan: "network",
    eyebrow: "Network · cross-agency hub",
    headline: "Operate multiple brands and reach the platform-wide hub",
    body: "Run several agencies under one login. Promote talent into the cross-agency discovery hub for visibility outside your roster.",
    primaryCta: "Talk to us",
    secondaryCta: "Learn more",
    stats: [
      { value: "multi", label: "agencies" },
      { value: "hub", label: "discovery" },
      { value: "white-label", label: "domains" },
    ],
  },
  network: null,
};

/** Conversion hero for the *next* tier above `currentPlan`. Null when on Network. */
export function nextHero(currentPlan: Plan): ConversionHero | null {
  return HERO_BY_PLAN[currentPlan];
}

/** True when `cardTier` is above the active plan and should render locked. */
export function isLocked(cardTier: Plan, activePlan: Plan): boolean {
  return PLAN_ORDER.indexOf(cardTier) > PLAN_ORDER.indexOf(activePlan);
}

/** Parse `?plan=` search param into a valid Plan, defaulting to `agency`. */
export function parsePlan(raw: string | string[] | undefined): Plan {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "free" || v === "studio" || v === "agency" || v === "network") {
    return v;
  }
  return "agency";
}
