/**
 * Plan catalog — TS mirror of the future `plans` table.
 *
 * **Track C will replace this file with a DB table.** Until then, this is
 * the single source of truth for plan metadata, used by the upgrade modal,
 * pricing page, account drawer, and access resolver.
 *
 * Pricing values are sourced from the existing `upgrade-modal.tsx` PLANS
 * array as of 2026-04-25. They are deliberately copied here so the rest of
 * the migration can read from one place; when Track C lands, this file is
 * deleted and the same shape comes from `getPlanView()` reading the DB.
 *
 * Adding a plan key: add an entry here AND wire it into
 * `plan-capabilities.ts` and `plan-limits.ts`. After Track C, this becomes
 * three SQL inserts instead.
 */
import { isTalentTierRenameEnabled } from "./talent-tier-label";

export const PLAN_KEYS = [
  // Workspace-audience plans (agencies, hubs, free workspaces)
  "free",
  "website",
  "studio",
  "agency",
  "network",
  "legacy",
  // Talent-audience plans (solo workspaces owned by individual talents)
  // See docs/talent-monetization.md
  "talent_basic",
  "talent_pro",
  "talent_portfolio",
] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

/**
 * Which kind of tenant a plan applies to. The marketing pricing page
 * shows workspace plans; the talent self-upgrade UI shows talent plans.
 * They never mix.
 */
export const PLAN_AUDIENCES = ["workspace", "talent"] as const;
export type PlanAudience = (typeof PLAN_AUDIENCES)[number];

export type PlanDef = {
  key: PlanKey;
  audience: PlanAudience;
  displayName: string;
  tagline: string | null;
  description: string | null;
  /** Ordering for "is upgrade?" calculations within an audience. Higher rank = more capable. */
  rank: number;
  /** Pricing in cents. Null = "contact us" / not publicly priced. */
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  trialDays: number | null;
  badgeColor: string | null;
  accentColor: string | null;
  /** Visible on public pricing page? Special plans (`legacy`, `enterprise_*`, `talent_basic` baseline) → false. */
  isVisible: boolean;
  /** Selectable in self-serve upgrade modal? Special plans → false. */
  isSelfServe: boolean;
  /** Existing tenants keep, new tenants can't pick. */
  isArchived: boolean;
};

export const PLAN_CATALOG: Record<PlanKey, PlanDef> = {
  // ─── Workspace-audience plans ─────────────────────────────────────────
  free: {
    key: "free",
    audience: "workspace",
    displayName: "Free",
    tagline: "For getting started",
    description: "Manage your roster and receive inquiries. No public site.",
    rank: 0,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    currency: "USD",
    trialDays: null,
    badgeColor: "#a1a1aa",
    accentColor: "#0b0b0d",
    isVisible: true,
    isSelfServe: true,
    isArchived: false,
  },
  website: {
    key: "website",
    audience: "workspace",
    displayName: "Website",
    tagline: "For local businesses",
    description:
      "A full site builder on your own domain, in two languages, with a forms inbox and payments. No talent roster.",
    rank: 1,
    monthlyPriceCents: 1200,
    annualPriceCents: 12000,
    currency: "USD",
    trialDays: 14,
    badgeColor: "#3fa7a0",
    accentColor: "#2b7a74",
    // NOT LAUNCHED. The DB is the enforcing side and has always said so
    // (`product_tiers.website.is_active = false`, which keeps the tier off the
    // pricing ladder and makes `resolveWorkspacePriceId('website')` return
    // null so no checkout can start). These two flags said the opposite, which
    // left the tier in two contradictory states at once: unsellable in the
    // database, advertised and self-serve in code.
    //
    // Low blast radius today, because sellability is decided by the DB. But
    // Website has ZERO `product_features` rows, so flipping `is_active` without
    // seeding them would publish a compare-table column of dashes. Aligning the
    // code to the DB means the tier is now coherently "not launched yet", and
    // launching it is a deliberate three-part change: seed the features, flip
    // `is_active`, flip these flags back.
    isVisible: false,
    isSelfServe: false,
    isArchived: false,
  },
  studio: {
    key: "studio",
    audience: "workspace",
    displayName: "Studio",
    tagline: "For small teams",
    // CORRECTED 2026-09-02. This read "Embed your roster anywhere. Studio adds
    // widgets and API access." — a description of AGENCY's capability set, sold
    // as Studio's. `plan_tier_caps` has Studio at embed_widgets=false and
    // api_access=false; there is also no public API in the product to grant.
    // What Studio actually adds over Free is the people machinery, which is what
    // the live Stripe product description has always said.
    description:
      "Your website plus the people machinery: a roster of up to 15, three team seats, commissions, and coordinated bookings.",
    rank: 2,
    monthlyPriceCents: 2900,
    annualPriceCents: 29000,
    currency: "USD",
    trialDays: 14,
    badgeColor: "#3a7bff",
    accentColor: "#2a5fd1",
    isVisible: true,
    isSelfServe: true,
    isArchived: false,
  },
  agency: {
    key: "agency",
    audience: "workspace",
    displayName: "Agency",
    tagline: "For full agencies",
    // CORRECTED 2026-09-02. This read "Your domain. Your pages. Your brand.
    // Pages, posts, navigation, theme." — the WEBSITE tier's pitch, on the
    // Agency row. The plan descriptions were shifted by one rung. What Agency
    // actually adds over Studio is unlimited roster and team, exclusivity, and
    // the capabilities `plan_tier_caps` reserves for it.
    description:
      "Unlimited roster and team, exclusivity management, pitch tools, and priority support.",
    rank: 3,
    monthlyPriceCents: 7900,
    annualPriceCents: 79000,
    currency: "USD",
    trialDays: 14,
    badgeColor: "#c9a227",
    accentColor: "#8b6d1f",
    isVisible: true,
    isSelfServe: true,
    isArchived: false,
  },
  network: {
    key: "network",
    audience: "workspace",
    // Product label is "Network" (private talent hubs / enterprise tier). The
    // internal plan key stays `network` to avoid a high-blast-radius DB enum
    // rename (same staged caution as coordinator→manager). Surface "Network"
    // everywhere via this displayName. Custom, sales-led pricing — never
    // show a dollar price for this tier.
    displayName: "Network",
    tagline: "Private hubs + enterprise",
    description: "Run private talent hubs and reach the cross-agency discovery network. Enterprise-level, multi-brand.",
    rank: 4,
    monthlyPriceCents: null,
    annualPriceCents: null,
    currency: "USD",
    trialDays: null,
    badgeColor: "#146b3a",
    accentColor: "#0e4a26",
    isVisible: true,
    isSelfServe: false,
    isArchived: false,
  },
  legacy: {
    key: "legacy",
    audience: "workspace",
    displayName: "Legacy",
    tagline: null,
    description:
      "Pre-pricing-model tenant grandfathered into capability set. Used by tenant #1 (Impronta Models Tulum). Migrates to a standard plan when contract permits.",
    rank: 99,
    monthlyPriceCents: null,
    annualPriceCents: null,
    currency: "USD",
    trialDays: null,
    badgeColor: null,
    accentColor: null,
    isVisible: false,
    isSelfServe: false,
    isArchived: false,
  },

  // ─── Talent-audience plans ────────────────────────────────────────────
  // See docs/talent-monetization.md for the architectural direction.
  // Pricing values are placeholders pending product decision.
  talent_basic: {
    key: "talent_basic",
    audience: "talent",
    displayName: "Free",
    tagline: "Default for every talent",
    description:
      "Standard profile, included free. Canonical Tulala-hosted profile at tulala.digital/t/<slug>. Roster participation in agencies and hubs.",
    rank: 0,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    currency: "USD",
    trialDays: null,
    badgeColor: "#a1a1aa",
    accentColor: "#0b0b0d",
    // Hidden from pricing page — it's the baseline; users don't pick it explicitly.
    isVisible: false,
    isSelfServe: true,
    isArchived: false,
  },
  // FOLDED 2026-09-23 (decision-log L45 reversal + Pro fold): `talent_pro` is
  // no longer sold or shown anywhere. Its key, prices, rank and Stripe ids are
  // kept untouched so existing Pro subscriptions keep resolving; new signups
  // and the compare view only ever see Free and Web Office. Its capability
  // set is now a strict subset of talent_portfolio's (see talent-membership.ts).
  talent_pro: {
    key: "talent_pro",
    audience: "talent",
    displayName: "Pro",
    tagline: "Richer presentation",
    description:
      "Pro layout, video and audio embeds, social-link surfacing, better media gallery, stronger portfolio presentation. Same canonical URL at tulala.digital/t/<slug>, richer page render. Ratified pricing 2026-08-20: $9/mo.",
    rank: 1,
    monthlyPriceCents: 900,
    annualPriceCents: 9000,
    currency: "USD",
    trialDays: 14,
    badgeColor: "#7d5cff",
    accentColor: "#5b3ed6",
    isVisible: false,
    isSelfServe: false,
    isArchived: false,
  },
  // RENAMED 2026-09-23 (label only; key/rank/Stripe ids untouched): the one
  // paid talent tier is now "Web Office" everywhere user-facing. It absorbs
  // the former Pro perks (embeds, press band, media kit, priority discovery,
  // badge removal) — see talent-membership.ts for the capability superset.
  talent_portfolio: {
    key: "talent_portfolio",
    audience: "talent",
    displayName: "Web Office",
    tagline: "Your website, fully unlocked",
    description:
      "Add pages and sections, a custom domain, SEO and analytics, custom CSS and motion, badge removal, embeds and press, a media kit, priority discovery, branded invoices, the lowest fee, and design help from the Tulala team. The canonical URL tulala.digital/t/<slug> remains the first public destination. Ratified pricing 2026-08-20: $15/mo.",
    rank: 2,
    monthlyPriceCents: 1500,
    annualPriceCents: 15000,
    currency: "USD",
    trialDays: 14,
    badgeColor: "#d96b3a",
    accentColor: "#a14a1f",
    isVisible: true,
    isSelfServe: true,
    isArchived: false,
  },
};

export function isKnownPlan(key: string): key is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(key);
}

/**
 * The talent-plan COPY the "Web Office" rename changed, kept here verbatim so
 * a dark build (`TALENT_FREE_WEBSITE_ENABLED` unset) reads exactly as it did
 * before Phase 1. `PLAN_CATALOG` above carries the post-rename values; this
 * overlay restores the pre-rename ones while the switch is off.
 *
 * Copy only. Keys, ranks, prices, trial days, Stripe ids, `isVisible` and
 * `isSelfServe` are identical on both sides of the switch, so neither billing
 * nor the Pro fold can diverge with it. The Pro fold is unconditional.
 */
const TALENT_PLAN_PRE_RENAME_OVERLAY: Partial<Record<PlanKey, Partial<PlanDef>>> = {
  talent_portfolio: {
    displayName: "Portfolio",
    tagline: "Your branded talent page",
    description:
      "Personal-site builder access, preview and publish controls, a talent-owned section library, and SEO controls. The canonical URL tulala.digital/t/<slug> remains the first public destination; custom domains come later. Ratified pricing 2026-08-20: $15/mo.",
  },
};

/**
 * Apply the pre-rename overlay while the free-website switch is off. Read at
 * CALL time, never captured at module load, so tests can exercise both
 * switch positions in one process.
 */
function resolvePlanDef(def: PlanDef): PlanDef {
  if (isTalentTierRenameEnabled()) return def;
  const overlay = TALENT_PLAN_PRE_RENAME_OVERLAY[def.key];
  return overlay ? { ...def, ...overlay } : def;
}

export function getPlan(key: PlanKey): PlanDef {
  return resolvePlanDef(PLAN_CATALOG[key]);
}

/**
 * The name a human reads for a plan. The ONLY supported way to render a plan
 * name: reading `PLAN_CATALOG[key].displayName` directly skips the fold and
 * would print "Web Office" in a dark build.
 */
export function planDisplayName(key: PlanKey): string {
  return getPlan(key).displayName;
}

/** Plans visible on the public pricing page, in display order. Workspace audience. */
export function getVisibleWorkspacePlans(): PlanDef[] {
  return Object.values(PLAN_CATALOG)
    .map(resolvePlanDef)
    .filter((p) => p.audience === "workspace" && p.isVisible && !p.isArchived)
    .sort((a, b) => a.rank - b.rank);
}

/** Plans visible on the talent self-upgrade UI, in display order. Talent audience. */
export function getVisibleTalentPlans(): PlanDef[] {
  return Object.values(PLAN_CATALOG)
    .map(resolvePlanDef)
    .filter((p) => p.audience === "talent" && p.isVisible && !p.isArchived)
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Visible plans across both audiences. Use only for cross-audience views;
 * audience-scoped UIs should use the audience-specific helpers.
 */
export function getVisiblePlans(): PlanDef[] {
  return Object.values(PLAN_CATALOG)
    .map(resolvePlanDef)
    .filter((p) => p.isVisible && !p.isArchived)
    .sort((a, b) => {
      if (a.audience !== b.audience) return a.audience.localeCompare(b.audience);
      return a.rank - b.rank;
    });
}

/**
 * Self-serve plans the user can upgrade to from `currentPlan`.
 * Filters to the same audience — workspace plans only show workspace
 * upgrades; talent plans only show talent upgrades.
 */
export function getUpgradePathFromPlan(currentPlan: PlanKey): PlanDef[] {
  const current = PLAN_CATALOG[currentPlan];
  return Object.values(PLAN_CATALOG)
    .map(resolvePlanDef)
    .filter(
      (p) =>
        p.audience === current.audience &&
        p.isVisible &&
        p.isSelfServe &&
        !p.isArchived &&
        p.rank > current.rank,
    )
    .sort((a, b) => a.rank - b.rank);
}
