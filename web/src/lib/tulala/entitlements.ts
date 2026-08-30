/**
 * entitlements.ts — the ONE entitlement read the Tulala Recommendation Engine uses.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Agent is about to recommend plans out loud, in prose, to a stranger. That
 * turns every internal inconsistency into a promise. Before this module there
 * was no single answer to "what does Studio cost and how many people can it
 * hold", because the pieces lived in different places with different vocabulary
 * and, historically, different numbers:
 *
 *   price       → product_prices (DB). This is what Stripe Checkout charges.
 *   seat cap    → PLAN_SEAT_CAPS (code). This is what the roster actually
 *                 enforces, via agencies.talent_seat_limit.
 *   commission  → platform_commission_config (DB).
 *   trial       → plan_trial_offers (DB), admin-editable.
 *   labels      → product_tiers (DB) for public copy, plan-catalog.ts for keys.
 *
 * Each field is read from wherever the truth is ENFORCED, not from whichever
 * source was most convenient. A price read from code would be a price nobody is
 * charged; a seat cap read from marketing copy would be a cap nobody enforces.
 * That exact mismatch is what put "Up to 50 talent profiles" on the pricing page
 * against a hard limit of 15.
 *
 * TWO VOCABULARIES, RECONCILED HERE
 * ─────────────────────────────────
 * The DB and the code disagree on names, and both are load-bearing:
 * `product_tiers.slug` says `hub` / `pro` / `max`, while `PlanKey` says
 * `network` / `talent_pro` / `talent_portfolio`. Neither can be renamed cheaply
 * (the plan key is a DB enum with wide blast radius; the tier slug is what
 * Checkout joins on). So the mapping is declared once, here, and every consumer
 * gets both spellings on the same object.
 *
 * THE PROMPT BOUNDARY
 * ───────────────────
 * Nothing in this module may be interpolated into a system prompt. The LLM
 * receives a *resolved* recommendation — a plan key plus reasons — and puts it
 * into words. It never sees the catalog and never computes a price, because a
 * model that can see $29 can say $27. See `redactForPrompt` for the only
 * sanctioned way to hand plan identity to a model.
 */

import "server-only";
import { cache } from "react";

import { PLAN_CATALOG, type PlanKey } from "@/lib/access/plan-catalog";
import { PLAN_SEAT_CAPS, type SeatCapPlan } from "@/lib/saas/plan-seat-caps";
import { loadActivePrices, type ActiveTier } from "@/lib/pricing/get-active-prices";
import { loadTrialOffers, type TrialOffer } from "@/lib/plan-trials/offers";
import {
  loadPlanTakeConfig,
  resolvePlanTakeBps,
  PLATFORM_DEFAULT_TAKE_BPS,
  PLATFORM_DEFAULT_CLIENT_SURCHARGE_BPS,
} from "@/lib/billing/platform-take-rate";
import { logServerError } from "@/lib/server/safe-error";

// ─── Vocabulary ───────────────────────────────────────────────────────────────

export type PlanFamily = "workspace" | "talent";

/**
 * `PlanKey` → `product_tiers.slug`, for the keys where the two differ.
 * Absent keys map to themselves.
 */
const DB_TIER_SLUG: Partial<Record<PlanKey, string>> = {
  network: "hub",
  talent_basic: "free",
  talent_pro: "pro",
  talent_portfolio: "max",
};

/**
 * The plans the intake may consider, in ascending order within each family.
 *
 * `legacy` is deliberately absent: existing tenants keep it, nobody new can be
 * put on it, so it is not a recommendation the Agent can ever correctly make.
 */
export const RECOMMENDABLE_PLANS: Record<PlanFamily, readonly PlanKey[]> = {
  workspace: ["free", "website", "studio", "agency", "network"],
  talent: ["talent_basic", "talent_pro", "talent_portfolio"],
};

// ─── Public shape ─────────────────────────────────────────────────────────────

export type TulalaPlanOption = {
  family: PlanFamily;
  /** Code vocabulary. What capability and limit checks key on. */
  planKey: PlanKey;
  /** DB vocabulary. What Checkout joins against. */
  dbTierSlug: string;
  displayName: string;
  /** Public one-liner from the DB, so admin edits show up without a deploy. */
  tagline: string | null;
  /** Null means not publicly priced (sales-led). Zero means genuinely free. */
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  /** Pre-formatted for display, e.g. "$29". Null when not publicly priced. */
  formattedMonthly: string | null;
  /**
   * Roster profiles this plan can hold, ENFORCED. `null` = unlimited.
   * `0` is not a missing value: Website deliberately seats nobody, which is why
   * recommending it to anyone who works with other people is a functional
   * downgrade from Free wearing an upgrade label.
   */
  rosterSeats: number | null;
  trialDays: number | null;
  /** Admin kill-switch on the self-serve trial CTA for this plan. */
  trialEnabled: boolean;
  isSelfServe: boolean;
  /**
   * Can a card actually be charged for this plan right now? False when the tier
   * has no usable Stripe price. A recommendation for an unsellable plan is a
   * dead end, so the engine must filter on this rather than on price alone.
   * Always true for genuinely free plans.
   */
  isSellableNow: boolean;
  /** Public bullets from the DB, highlight rows only, in display order. */
  highlights: string[];
};

export type TulalaEntitlements = {
  /** Platform take on a paid booking, in basis points. Same on every plan. */
  commissionBps: number;
  /** The client-side share of the take, added on top of what the client pays. */
  clientSurchargeBps: number;
  workspace: TulalaPlanOption[];
  talent: TulalaPlanOption[];
  currency: string;
  /**
   * True when at least one source read failed and a documented default stood in.
   * The engine may still recommend on a degraded catalog, but the Agent must not
   * quote a price from one — callers are expected to check this.
   */
  degraded: boolean;
  loadedAt: string;
};

// ─── Loader ───────────────────────────────────────────────────────────────────

function seatsFor(planKey: PlanKey): number | null {
  // Talent plans are a personal profile, not a roster. "Seats" is not a
  // meaningful axis for them, and reporting 0 would read as "cannot seat
  // anyone", which the roster disqualifier would then act on. Undefined-by-
  // design is expressed as null (unlimited/not-applicable) for talent.
  if (PLAN_CATALOG[planKey].audience === "talent") return null;
  return planKey in PLAN_SEAT_CAPS ? PLAN_SEAT_CAPS[planKey as SeatCapPlan] : null;
}

function buildOption(
  family: PlanFamily,
  planKey: PlanKey,
  dbTier: ActiveTier | undefined,
  trial: TrialOffer | undefined,
): TulalaPlanOption {
  const def = PLAN_CATALOG[planKey];
  const dbTierSlug = DB_TIER_SLUG[planKey] ?? planKey;

  const monthly = dbTier?.prices.find((p) => p.interval === "month") ?? null;
  const annual = dbTier?.prices.find((p) => p.interval === "year") ?? null;

  // A plan-catalog price of 0 means genuinely free, and free tiers correctly
  // have no product_prices row. Anything else takes its amount from the DB,
  // because the DB row is what the card is charged.
  const isFreeTier = def.monthlyPriceCents === 0;
  const monthlyPriceCents = isFreeTier ? 0 : (monthly?.unitAmount ?? null);
  const annualPriceCents = isFreeTier ? 0 : (annual?.unitAmount ?? null);

  return {
    family,
    planKey,
    dbTierSlug,
    displayName: dbTier?.name ?? def.displayName,
    tagline: dbTier?.tagline ?? def.tagline,
    monthlyPriceCents,
    annualPriceCents,
    currency: monthly?.currency ?? def.currency,
    formattedMonthly: isFreeTier ? null : (monthly?.formatted ?? null),
    rosterSeats: seatsFor(planKey),
    // plan_trial_offers is admin-editable and therefore the live answer;
    // plan-catalog is the fallback default.
    trialDays: trial?.trialDays ?? def.trialDays,
    trialEnabled: trial ? trial.isEnabled : def.trialDays != null,
    isSelfServe: def.isSelfServe,
    isSellableNow: isFreeTier || Boolean(monthly?.stripePriceId),
    highlights: dbTier?.highlights ?? [],
  };
}

/**
 * Load the entitlement catalog. Cached per request.
 *
 * `currency` only affects displayed amounts; seats, commission and sellability
 * are currency-independent.
 */
export const loadTulalaEntitlements = cache(
  async (currency: string = "USD"): Promise<TulalaEntitlements> => {
    let degraded = false;

    const [pricesResult, workspaceTrials, talentTrials, takeConfig] = await Promise.all([
      loadActivePrices(currency).catch((err) => {
        logServerError("tulala.entitlements.prices", err);
        return null;
      }),
      loadTrialOffers("workspace").catch(() => []),
      loadTrialOffers("talent").catch(() => []),
      loadPlanTakeConfig().catch(() => null),
    ]);

    if (!pricesResult || pricesResult.packages.length === 0) degraded = true;
    if (!takeConfig) degraded = true;

    const tiersBySlug = new Map<string, ActiveTier>();
    for (const pkg of pricesResult?.packages ?? []) {
      for (const tier of pkg.tiers) {
        tiersBySlug.set(`${pkg.packageSlug}/${tier.slug}`, tier);
      }
    }

    const trialsByKey = new Map<string, TrialOffer>();
    for (const t of [...workspaceTrials, ...talentTrials]) {
      trialsByKey.set(`${t.audience}/${t.planKey}`, t);
    }

    const build = (family: PlanFamily): TulalaPlanOption[] =>
      RECOMMENDABLE_PLANS[family].map((planKey) =>
        buildOption(
          family,
          planKey,
          tiersBySlug.get(`${family}/${DB_TIER_SLUG[planKey] ?? planKey}`),
          trialsByKey.get(`${family}/${planKey}`),
        ),
      );

    // The take is flat across tiers today (plan_tier_bps is empty), but it is
    // read per-plan rather than assumed so a future per-tier rate cannot make
    // the Agent's explanation wrong without also changing this number.
    const commissionBps = resolvePlanTakeBps(takeConfig, "free");
    const clientSurchargeBps =
      typeof takeConfig?.client_surcharge_bps === "number"
        ? Math.max(0, Math.round(takeConfig.client_surcharge_bps))
        : PLATFORM_DEFAULT_CLIENT_SURCHARGE_BPS;

    return {
      commissionBps,
      clientSurchargeBps,
      workspace: build("workspace"),
      talent: build("talent"),
      currency: currency.toUpperCase(),
      degraded,
      loadedAt: new Date().toISOString(),
    };
  },
);

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function planOption(
  ents: TulalaEntitlements,
  planKey: PlanKey,
): TulalaPlanOption | null {
  return (
    ents.workspace.find((p) => p.planKey === planKey) ??
    ents.talent.find((p) => p.planKey === planKey) ??
    null
  );
}

/**
 * The cheapest workspace plan that can actually seat `people` roster profiles.
 *
 * This is where `rosterSeats: 0` earns its keep. Website is cheaper than Studio
 * and would win any price-ordered search, but it seats nobody, so for any
 * `people >= 1` it must lose to Free — which is both cheaper AND more capable
 * on this axis. Returns null when nothing in the catalog fits, which is a real
 * outcome (a 40-person roster on a catalog where Agency is unsellable).
 */
export function cheapestWorkspacePlanSeating(
  ents: TulalaEntitlements,
  people: number,
): TulalaPlanOption | null {
  const fits = ents.workspace.filter(
    (p) =>
      p.isSellableNow &&
      p.isSelfServe &&
      (p.rosterSeats === null || p.rosterSeats >= people),
  );
  if (fits.length === 0) return null;
  return fits.reduce((best, p) =>
    (p.monthlyPriceCents ?? Infinity) < (best.monthlyPriceCents ?? Infinity) ? p : best,
  );
}

/** Percentage string for the platform take, e.g. "6%". */
export function commissionLabel(ents: TulalaEntitlements): string {
  const pct = ents.commissionBps / 100;
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`;
}

/**
 * The ONLY shape that may reach a model.
 *
 * Deliberately drops every number: price, seats, commission, trial length. The
 * model's job is to explain a decision already made, in the user's own terms.
 * If it can see "$29" it can write "$27", and a wrong price in a signup
 * conversation is a promise the business has to either honour or break. Numbers
 * are rendered by React from the resolved recommendation, never by the LLM.
 */
export function redactForPrompt(option: TulalaPlanOption): {
  planKey: PlanKey;
  displayName: string;
  family: PlanFamily;
} {
  return {
    planKey: option.planKey,
    displayName: option.displayName,
    family: option.family,
  };
}

export { PLATFORM_DEFAULT_TAKE_BPS };
