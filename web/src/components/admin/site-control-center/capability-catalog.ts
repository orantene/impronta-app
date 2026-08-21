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

export type Plan = "free" | "website" | "studio" | "agency" | "network";

export const PLAN_ORDER: Plan[] = ["free", "website", "studio", "agency", "network"];

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  website: "Website",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

/** Palette per the mockup. Not part of the dashboard token set on purpose —
 *  these badges are the *only* place tier color leaks through, so we keep
 *  them inline and don't pollute the global theme. */
export const PLAN_COLOR: Record<Plan, { bg: string; fg: string }> = {
  free: { bg: "#eae7db", fg: "#0b0b0d" },
  website: { bg: "#2b7a74", fg: "#ffffff" },
  studio: { bg: "#2a5fd1", fg: "#ffffff" },
  agency: { bg: "#8b6d1f", fg: "#ffffff" },
  network: { bg: "#146b3a", fg: "#ffffff" },
};

/** Softer, tier-tinted palette used for section-divider tier badges and locked
 *  tier-cta links. Mirrors the mockup's section-divider tier-badge styling. */
export const PLAN_BADGE_COLOR: Record<Plan, { bg: string; fg: string }> = {
  free: { bg: "#eae7db", fg: "#5b5b63" },
  website: { bg: "rgba(63,167,160,0.14)", fg: "#2b7a74" },
  studio: { bg: "rgba(58,123,255,0.12)", fg: "#2a5fd1" },
  agency: { bg: "rgba(139,109,31,0.14)", fg: "#6b5215" },
  network: { bg: "rgba(20,107,58,0.12)", fg: "#0e4a26" },
};

/**
 * i18n contract for this catalog (mirrors `lib/access/registration-modes.ts`
 * and `lib/admin/plan-tiers.ts`): the English strings stay as the non-UI
 * fallback (docs, tests, server logs), and every UI surface renders the
 * matching `*Key` through `t()`. `catalogCopy(t, key, english)` below is the
 * one helper every renderer should use.
 */
export type Capability = {
  id: string;
  /** Plan tier that unlocks this capability. */
  tier: Plan;
  label: string;
  /** Catalog key for {@link Capability.label}. */
  labelKey: string;
  /** Stat / status line shown when unlocked (e.g. "12 pages · 3 drafts"). */
  stat: string;
  /** Catalog key for {@link Capability.stat}. */
  statKey: string;
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
  /** Catalog key for {@link TierBand.headline}. */
  headlineKey: string;
  /** One-sentence description. */
  helper: string;
  /** Catalog key for {@link TierBand.helper}. */
  helperKey: string;
  /** "Every plan" / "Studio" / "Agency" / "Network" badge label. */
  badgeLabel: string;
  /** Catalog key for {@link TierBand.badgeLabel}. */
  badgeLabelKey: string;
  /** Upgrade button copy — "Upgrade" for paid, "Contact" for Network. */
  ctaLabel: string;
  /** Catalog key for {@link TierBand.ctaLabel}. Empty when there is no CTA. */
  ctaLabelKey: string;
  cards: Capability[];
};

/**
 * Resolve a catalog key, falling back to the module-level English constant
 * when the key has no catalog entry (unknown id, or a value we deliberately
 * never translate such as a hostname).
 */
export function catalogCopy(
  t: (key: string) => string,
  key: string,
  english: string,
): string {
  if (!key) return english;
  const resolved = t(key);
  return resolved === key ? english : resolved;
}

const FREE_CARDS: Capability[] = [
  {
    id: "roster",
    tier: "free",
    label: "Roster",
    labelKey: "dashboard.adminCapability.card.roster.label",
    stat: "Talents · drafts · approvals",
    statKey: "dashboard.adminCapability.card.roster.stat",
    lockedCopy: "Manage every talent on your roster",
    href: "/admin/talent",
    icon: Users,
  },
  {
    id: "directory",
    tier: "free",
    label: "Directory Settings",
    labelKey: "dashboard.adminCapability.card.directory.label",
    stat: "Grid · Dedicated pages · 34 fields",
    statKey: "dashboard.adminCapability.card.directory.stat",
    lockedCopy: "Configure how your talents are discovered",
    href: "/admin/directory/filters",
    icon: LayoutGrid,
    iconAccent: true,
  },
  {
    id: "inquiries",
    tier: "free",
    label: "Inquiries",
    labelKey: "dashboard.adminCapability.card.inquiries.label",
    stat: "Open · in progress · won",
    statKey: "dashboard.adminCapability.card.inquiries.stat",
    lockedCopy: "Receive booking requests through your site",
    href: "/admin/inquiries",
    icon: Inbox,
  },
  {
    id: "branding",
    tier: "free",
    label: "Branding",
    labelKey: "dashboard.adminCapability.card.branding.label",
    stat: "Logo · Cormorant / Inter · #B8860B",
    statKey: "dashboard.adminCapability.card.branding.stat",
    lockedCopy: "Set your logo, colors, and typography",
    href: "/admin/site-settings/branding",
    icon: Sparkles,
  },
  {
    id: "activity",
    tier: "free",
    label: "Activity",
    labelKey: "dashboard.adminCapability.card.activity.label",
    stat: "Recent edits, publishes, and bookings",
    statKey: "dashboard.adminCapability.card.activity.stat",
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
    labelKey: "dashboard.adminCapability.card.widgets.label",
    stat: "Active embeds · views",
    statKey: "dashboard.adminCapability.card.widgets.stat",
    lockedCopy: "Embed your roster anywhere",
    href: "/admin/site/widgets",
    icon: LayoutDashboard,
  },
  {
    id: "api",
    tier: "studio",
    label: "API keys",
    labelKey: "dashboard.adminCapability.card.api.label",
    stat: "Active keys · last used",
    statKey: "dashboard.adminCapability.card.api.stat",
    lockedCopy: "Read-only JSON for partners",
    href: "/admin/site/api-keys",
    icon: Key,
  },
  {
    id: "domain",
    tier: "studio",
    label: "Domain & Home",
    labelKey: "dashboard.adminCapability.card.domain.label",
    stat: "Subdomain · public home",
    statKey: "dashboard.adminCapability.card.domain.stat",
    lockedCopy: "Your subdomain for deep links",
    href: "/admin/site/domain",
    icon: Globe2,
  },
];

const AGENCY_CARDS: Capability[] = [
  {
    id: "homepage",
    tier: "agency",
    label: "Homepage",
    labelKey: "dashboard.adminCapability.card.homepage.label",
    stat: "Draft pending",
    statKey: "dashboard.adminCapability.card.homepage.stat",
    lockedCopy: "Your branded homepage",
    href: "/",
    icon: Star,
    iconAccent: true,
  },
  {
    id: "pages",
    tier: "agency",
    label: "Pages",
    labelKey: "dashboard.adminCapability.card.pages.label",
    stat: "12 pages · 3 drafts",
    statKey: "dashboard.adminCapability.card.pages.stat",
    lockedCopy: "Any page, any layout",
    href: "/admin/site-settings/content/pages",
    icon: FileText,
    iconAccent: true,
  },
  {
    id: "posts",
    tier: "agency",
    label: "Posts",
    labelKey: "dashboard.adminCapability.card.posts.label",
    stat: "4 published · 1 draft",
    statKey: "dashboard.adminCapability.card.posts.stat",
    lockedCopy: "Your editorial voice",
    href: "/admin/site-settings/content/posts",
    icon: Newspaper,
  },
  {
    id: "navigation",
    tier: "agency",
    label: "Navigation & Footer",
    labelKey: "dashboard.adminCapability.card.navigation.label",
    stat: "Header 5 · Footer 3 cols",
    statKey: "dashboard.adminCapability.card.navigation.stat",
    lockedCopy: "Drag-and-drop in canvas",
    href: "/admin/site-settings/content/navigation",
    icon: Menu,
  },
  {
    id: "theme",
    tier: "agency",
    label: "Theme & foundations",
    labelKey: "dashboard.adminCapability.card.theme.label",
    stat: "Editorial Noir",
    statKey: "dashboard.adminCapability.card.theme.stat",
    lockedCopy: "A library of designer kits",
    href: "/admin/site-settings/design",
    icon: Palette,
  },
  {
    id: "seo",
    tier: "agency",
    label: "SEO & defaults",
    labelKey: "dashboard.adminCapability.card.seo.label",
    stat: "Meta · Sitemap · 2 redirects",
    statKey: "dashboard.adminCapability.card.seo.stat",
    lockedCopy: "Full SEO stack on your domain",
    href: "/admin/site-settings/seo",
    icon: Search,
  },
];

const NETWORK_CARDS: Capability[] = [
  {
    id: "hub",
    tier: "network",
    label: "Hub publishing",
    labelKey: "dashboard.adminCapability.card.hub.label",
    stat: "0 talents promoted",
    statKey: "dashboard.adminCapability.card.hub.stat",
    lockedCopy: "Cross-agency discovery",
    href: "/admin/site/hub",
    icon: Network,
  },
  {
    id: "multiagency",
    tier: "network",
    label: "Multi-agency manager",
    labelKey: "dashboard.adminCapability.card.multiagency.label",
    stat: "1 agency · 3 managers",
    statKey: "dashboard.adminCapability.card.multiagency.stat",
    lockedCopy: "Operate multiple brands",
    href: "/admin/site/multi-agency",
    icon: Code2,
  },
];

export const TIER_BANDS: TierBand[] = [
  {
    tier: "free",
    headline: "Your core workspace",
    headlineKey: "dashboard.adminCapability.band.free.headline",
    helper: "Free, Studio, Agency, Network. All plans share this.",
    helperKey: "dashboard.adminCapability.band.free.helper",
    badgeLabel: "Every plan",
    badgeLabelKey: "dashboard.adminCapability.band.free.badgeLabel",
    // No CTA on the every-plan band, so no key either.
    ctaLabel: "",
    ctaLabelKey: "",
    cards: FREE_CARDS,
  },
  {
    tier: "studio",
    headline: "Embed anywhere",
    headlineKey: "dashboard.adminCapability.band.studio.headline",
    helper:
      "Drop your roster into WordPress, Webflow, Shopify, or your custom site.",
    helperKey: "dashboard.adminCapability.band.studio.helper",
    badgeLabel: "Studio",
    badgeLabelKey: "dashboard.adminCapability.band.studio.badgeLabel",
    ctaLabel: "Upgrade",
    ctaLabelKey: "dashboard.adminCapability.band.studio.ctaLabel",
    cards: STUDIO_CARDS,
  },
  {
    tier: "agency",
    headline: "Full branded site",
    headlineKey: "dashboard.adminCapability.band.agency.headline",
    helper: "Your site, your domain, your brand. Pages, posts, nav, theme, SEO.",
    helperKey: "dashboard.adminCapability.band.agency.helper",
    badgeLabel: "Agency",
    badgeLabelKey: "dashboard.adminCapability.band.agency.badgeLabel",
    ctaLabel: "Upgrade",
    ctaLabelKey: "dashboard.adminCapability.band.agency.ctaLabel",
    cards: AGENCY_CARDS,
  },
  {
    tier: "network",
    headline: "Multi-agency + hub",
    headlineKey: "dashboard.adminCapability.band.network.headline",
    helper: "Operate multiple agencies and push talent to cross-agency discovery.",
    helperKey: "dashboard.adminCapability.band.network.helper",
    badgeLabel: "Network",
    badgeLabelKey: "dashboard.adminCapability.band.network.badgeLabel",
    ctaLabel: "Contact",
    ctaLabelKey: "dashboard.adminCapability.band.network.ctaLabel",
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
  // Website has no conversion hero yet — its upsell copy is owned by the
  // marketing PR, not this one.
  website: null,
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
