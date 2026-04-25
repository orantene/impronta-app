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

export const PLAN_KEYS = ["free", "studio", "agency", "network", "legacy"] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

export type PlanDef = {
  key: PlanKey;
  displayName: string;
  tagline: string | null;
  description: string | null;
  /** Ordering for "is upgrade?" calculations. Higher rank = more capable. */
  rank: number;
  /** Pricing in cents. Null = "contact us" / not publicly priced. */
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  trialDays: number | null;
  badgeColor: string | null;
  accentColor: string | null;
  /** Visible on public pricing page? Special plans (`legacy`, `enterprise_*`) → false. */
  isVisible: boolean;
  /** Selectable in self-serve upgrade modal? Special plans → false. */
  isSelfServe: boolean;
  /** Existing tenants keep, new tenants can't pick. */
  isArchived: boolean;
};

export const PLAN_CATALOG: Record<PlanKey, PlanDef> = {
  free: {
    key: "free",
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
  studio: {
    key: "studio",
    displayName: "Studio",
    tagline: "For solo operators",
    description: "Embed your roster anywhere. Studio adds widgets and API access.",
    rank: 1,
    monthlyPriceCents: 4900,
    annualPriceCents: 49000,
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
    displayName: "Agency",
    tagline: "For full agencies",
    description: "Your domain. Your pages. Your brand. Pages, posts, navigation, theme.",
    rank: 2,
    monthlyPriceCents: 14900,
    annualPriceCents: 149000,
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
    displayName: "Network",
    tagline: "Multi-brand + hub",
    description: "Operate multiple agencies and reach the cross-agency discovery hub.",
    rank: 3,
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
};

export function isKnownPlan(key: string): key is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(key);
}

export function getPlan(key: PlanKey): PlanDef {
  return PLAN_CATALOG[key];
}

/** Plans visible on the public pricing page, in display order. */
export function getVisiblePlans(): PlanDef[] {
  return Object.values(PLAN_CATALOG)
    .filter((p) => p.isVisible && !p.isArchived)
    .sort((a, b) => a.rank - b.rank);
}

/** Self-serve plans the user can upgrade to from `currentPlan`. */
export function getUpgradePathFromPlan(currentPlan: PlanKey): PlanDef[] {
  const current = PLAN_CATALOG[currentPlan];
  return Object.values(PLAN_CATALOG)
    .filter(
      (p) =>
        p.isVisible &&
        p.isSelfServe &&
        !p.isArchived &&
        p.rank > current.rank,
    )
    .sort((a, b) => a.rank - b.rank);
}
