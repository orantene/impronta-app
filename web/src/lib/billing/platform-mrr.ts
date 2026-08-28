/**
 * platform-mrr.ts — MRR the platform can actually defend in a sentence.
 *
 * WHAT WAS HERE BEFORE
 * ────────────────────
 * The Billing page computed "Estimated MRR" from a hardcoded price map living
 * in the page file (`PLAN_PRICE_CENTS`), multiplied by a COUNT OF TENANT ROWS
 * grouped by `agencies.plan_tier`. Three things were wrong with that at once:
 *
 *   1. The map was a third source of truth for prices, and it had already
 *      drifted: it billed `network` at $299/mo when the catalog says the
 *      Network tier has no price at all (sales-assisted, `null`).
 *   2. `agencies.plan_tier` is the ENTITLEMENT column. A comped tenant — a plan
 *      override with `grant_kind` anything — writes its granted tier onto that
 *      exact column, so every free comp was counted as paying revenue.
 *   3. Nothing in it ever read a subscription. A cancelled, past-due or
 *      never-started plan contributed the same as a paying one.
 *
 * WHAT THIS DOES INSTEAD
 * ──────────────────────
 * MRR is derived from subscription rows — `workspace_subscriptions` and
 * `talent_subscriptions` — which exist only when Stripe actually has a
 * subscription. That single choice fixes the comp problem BY CONSTRUCTION: a
 * comped tenant has no subscription row, so it cannot be counted, and no
 * "exclude comps" filter has to be remembered by the next person. Comps are
 * reported as their own stat (active plan overrides) so the gap between
 * "tenants on a paid tier" and "tenants paying" is explainable rather than
 * mysterious.
 *
 * Rules, stated once:
 *   • Counted statuses: `active` and `past_due`. Past-due subscriptions are
 *     still owed and still billed by Stripe, so dropping them would understate;
 *     they are ALSO reported separately as the failed-payment number.
 *   • `trialing` is reported separately and contributes ZERO. A trial pays
 *     nothing this month; folding it into MRR is the classic way a dashboard
 *     starts lying right before a cohort converts badly.
 *   • Price resolution: `stripe_price_id` → the catalog price index first
 *     (exact, whatever the row is really being billed). Fallback: plan key →
 *     tier slug → the tier's canonical MONTHLY price. Yearly prices divide by
 *     12 — MRR is a monthly figure.
 *   • Discounts are netted off using the read-back mirror columns on the
 *     subscription row, and only while `discount_ends_at` is still in the
 *     future (a lapsed discount is not a discount).
 *   • A row whose price resolves to nothing lands in `unpricedCount` and
 *     contributes 0. It is SHOWN on the page. Guessing a number for it is how
 *     the old map was born.
 *
 * The computation is pure and exported for tests; the loader below is the only
 * part that touches the database.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  WORKSPACE_TIER_SLUG,
  TALENT_TIER_SLUG,
} from "@/lib/stripe/price-catalog";

/** The subset of a subscription row the MRR math needs. */
export type MrrSubscriptionRow = {
  side: "workspace" | "talent";
  planKey: string;
  status: string;
  stripePriceId: string | null;
  discountPercentOff: number | null;
  discountAmountOffCents: number | null;
  discountEndsAt: string | null;
  cancelledAt: string | null;
};

/** One catalog price, normalised to what MRR cares about. */
export type MrrPrice = {
  unitAmountCents: number;
  /** Catalog vocabulary: `month` | `year`. Anything else is ignored. */
  interval: string;
};

/**
 * Two lookups, because there are two ways to price a row: the exact Stripe
 * price it is billed on, and — when that id is missing or no longer in the
 * catalog — the tier its plan key names.
 */
export type MrrPriceIndex = {
  byStripePriceId: Record<string, MrrPrice>;
  /** tier slug → canonical monthly cents. */
  canonicalMonthlyByTierSlug: Record<string, number>;
};

export type PlatformMrr = {
  /** Net monthly recurring cents, after discounts. The headline number. */
  mrrCents: number;
  /** Before discounts — the difference is what the platform is giving away. */
  grossMrrCents: number;
  discountCents: number;
  /** Rows counted into MRR (status active or past_due, price resolved). */
  payingCount: number;
  /** Counted into MRR but currently failing to collect. */
  pastDueCount: number;
  /** Not counted: pays nothing yet. */
  trialingCount: number;
  /** Counted-status rows whose price could not be resolved. Never guessed. */
  unpricedCount: number;
};

export type PlatformChurn = {
  /** Subscriptions whose `cancelled_at` falls inside the window. */
  cancellationCount: number;
  windowDays: number;
};

/** Statuses that represent money Stripe is currently billing for. */
const BILLED_STATUSES = new Set(["active", "past_due"]);

/**
 * Plan key → `product_tiers.slug`, both sides in one table. Built from the
 * checkout-side maps so a tier rename cannot make MRR and checkout disagree.
 */
function tierSlugForPlanKey(side: "workspace" | "talent", planKey: string): string | null {
  if (side === "talent") {
    return TALENT_TIER_SLUG[planKey as keyof typeof TALENT_TIER_SLUG] ?? null;
  }
  const slug = WORKSPACE_TIER_SLUG[planKey as keyof typeof WORKSPACE_TIER_SLUG];
  // `network` maps to null on purpose (sales-assisted, no catalog price). An
  // unknown key also lands here. Both mean "unpriced", not "free".
  return slug ?? null;
}

/** A price row reduced to monthly cents, or null when the interval is unusable. */
function monthlyCentsOf(price: MrrPrice): number | null {
  if (!Number.isFinite(price.unitAmountCents) || price.unitAmountCents < 0) return null;
  if (price.interval === "month") return price.unitAmountCents;
  if (price.interval === "year") return price.unitAmountCents / 12;
  return null;
}

/**
 * Monthly cents for one subscription row, or null when nothing resolves.
 * Exported so the honest-vs-guessed distinction is directly testable.
 */
export function resolveMonthlyCents(
  row: MrrSubscriptionRow,
  index: MrrPriceIndex,
): number | null {
  const priceId = row.stripePriceId?.trim();
  if (priceId) {
    const price = index.byStripePriceId[priceId];
    if (price) {
      const monthly = monthlyCentsOf(price);
      if (monthly !== null) return monthly;
    }
  }
  const slug = tierSlugForPlanKey(row.side, row.planKey);
  if (!slug) return null;
  const canonical = index.canonicalMonthlyByTierSlug[slug];
  return typeof canonical === "number" ? canonical : null;
}

/**
 * The discount still in force on a row at `now`, applied to `grossCents`.
 * Percent first, then any fixed amount; never below zero.
 */
function applyDiscount(
  grossCents: number,
  row: MrrSubscriptionRow,
  now: Date,
): number {
  if (row.discountEndsAt) {
    const endsAt = Date.parse(row.discountEndsAt);
    // A discount that has already lapsed is not a discount. An unparseable
    // timestamp is treated as lapsed rather than as forever.
    if (Number.isNaN(endsAt) || endsAt <= now.getTime()) return grossCents;
  }
  let net = grossCents;
  const pct = row.discountPercentOff;
  if (typeof pct === "number" && pct > 0) {
    net = net * (1 - Math.min(pct, 100) / 100);
  }
  const flat = row.discountAmountOffCents;
  if (typeof flat === "number" && flat > 0) {
    net = net - flat;
  }
  return Math.max(0, net);
}

/**
 * MRR across both subscription tables. Pure: give it rows and a price index and
 * it will give the same answer forever.
 */
export function computePlatformMrr(
  rows: readonly MrrSubscriptionRow[],
  index: MrrPriceIndex,
  now: Date = new Date(),
): PlatformMrr {
  let grossMrrCents = 0;
  let mrrCents = 0;
  let payingCount = 0;
  let pastDueCount = 0;
  let trialingCount = 0;
  let unpricedCount = 0;

  for (const row of rows) {
    if (row.status === "trialing") {
      trialingCount += 1;
      continue;
    }
    if (!BILLED_STATUSES.has(row.status)) continue;
    if (row.status === "past_due") pastDueCount += 1;

    const monthly = resolveMonthlyCents(row, index);
    if (monthly === null) {
      unpricedCount += 1;
      continue;
    }
    payingCount += 1;
    grossMrrCents += monthly;
    mrrCents += applyDiscount(monthly, row, now);
  }

  const round = (n: number) => Math.round(n);
  const gross = round(grossMrrCents);
  const net = round(mrrCents);
  return {
    mrrCents: net,
    grossMrrCents: gross,
    discountCents: Math.max(0, gross - net),
    payingCount,
    pastDueCount,
    trialingCount,
    unpricedCount,
  };
}

/**
 * Cancellations inside the trailing window. Deliberately NOT called "churn
 * rate": a rate needs a denominator the platform does not yet have a stable
 * definition for, and the page label says "Cancellations (30d)" for that
 * reason. A count is a fact; a rate here would be a second guess.
 */
export function computeChurn(
  rows: readonly MrrSubscriptionRow[],
  now: Date = new Date(),
  windowDays = 30,
): PlatformChurn {
  const cutoff = now.getTime() - windowDays * 86400000;
  let cancellationCount = 0;
  for (const row of rows) {
    if (!row.cancelledAt) continue;
    const at = Date.parse(row.cancelledAt);
    if (Number.isNaN(at)) continue;
    if (at >= cutoff && at <= now.getTime()) cancellationCount += 1;
  }
  return { cancellationCount, windowDays };
}

// ─── Server loader ───────────────────────────────────────────────────────────

export type PlatformMrrSnapshot = PlatformMrr & {
  churn: PlatformChurn;
  /** Active plan overrides — the comps that are NOT in the MRR number. */
  compedWorkspaceCount: number;
  compedTalentCount: number;
  /** True when the catalog/subscription reads failed; the page says so. */
  degraded: boolean;
};

const EMPTY_SNAPSHOT: PlatformMrrSnapshot = {
  mrrCents: 0,
  grossMrrCents: 0,
  discountCents: 0,
  payingCount: 0,
  pastDueCount: 0,
  trialingCount: 0,
  unpricedCount: 0,
  churn: { cancellationCount: 0, windowDays: 30 },
  compedWorkspaceCount: 0,
  compedTalentCount: 0,
  degraded: true,
};

const SUBSCRIPTION_CAP = 5000;

type RawSubscription = {
  plan_key: string | null;
  status: string | null;
  stripe_price_id: string | null;
  discount_percent_off: number | null;
  discount_amount_off_cents: number | null;
  discount_ends_at: string | null;
  cancelled_at: string | null;
};

const SUBSCRIPTION_COLUMNS =
  "plan_key, status, stripe_price_id, discount_percent_off, discount_amount_off_cents, discount_ends_at, cancelled_at";

function toRows(
  side: "workspace" | "talent",
  raw: RawSubscription[] | null,
): MrrSubscriptionRow[] {
  return (raw ?? []).map((r) => ({
    side,
    planKey: r.plan_key ?? "",
    status: r.status ?? "",
    stripePriceId: r.stripe_price_id,
    discountPercentOff: r.discount_percent_off,
    discountAmountOffCents: r.discount_amount_off_cents,
    discountEndsAt: r.discount_ends_at,
    cancelledAt: r.cancelled_at,
  }));
}

/**
 * Read every subscription plus the price catalog, and reduce them to the
 * numbers the Revenue tab prints. Service-role: platform-wide by design, and
 * the `/platform/admin` layout has already gated super_admin before this runs.
 */
export async function loadPlatformMrr(): Promise<PlatformMrrSnapshot> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY_SNAPSHOT;

  try {
    const [wsRes, talentRes, priceRes, wsOverrideRes, talentOverrideRes] =
      await Promise.all([
        sb.from("workspace_subscriptions").select(SUBSCRIPTION_COLUMNS).limit(SUBSCRIPTION_CAP),
        sb.from("talent_subscriptions").select(SUBSCRIPTION_COLUMNS).limit(SUBSCRIPTION_CAP),
        sb
          .from("product_prices")
          .select(
            "stripe_price_id, unit_amount, interval, currency, valid_from, valid_until, product_tiers!inner(slug, is_active)",
          )
          .eq("currency", "USD")
          .eq("is_active", true)
          .is("archived_at", null),
        sb
          .from("workspace_plan_overrides")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        sb
          .from("talent_plan_overrides")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
      ]);

    if (wsRes.error) logServerError("billing.platform-mrr.workspace", wsRes.error);
    if (talentRes.error) logServerError("billing.platform-mrr.talent", talentRes.error);
    if (priceRes.error) logServerError("billing.platform-mrr.prices", priceRes.error);

    const index: MrrPriceIndex = {
      byStripePriceId: {},
      canonicalMonthlyByTierSlug: {},
    };
    type RawPrice = {
      stripe_price_id: string | null;
      unit_amount: number | null;
      interval: string | null;
      valid_from: string | null;
      valid_until: string | null;
      product_tiers: { slug: string | null; is_active: boolean | null } | null;
    };
    for (const raw of (priceRes.data ?? []) as unknown as RawPrice[]) {
      const amount = Number(raw.unit_amount ?? 0);
      const interval = raw.interval ?? "";
      const priceId = raw.stripe_price_id?.trim();
      if (priceId) index.byStripePriceId[priceId] = { unitAmountCents: amount, interval };
      // Canonical = no validity window. Sale rows are marketing, not what a
      // subscriber without a resolvable price id should be assumed to pay.
      const slug = raw.product_tiers?.slug;
      if (
        slug &&
        raw.product_tiers?.is_active !== false &&
        interval === "month" &&
        raw.valid_from === null &&
        raw.valid_until === null
      ) {
        index.canonicalMonthlyByTierSlug[slug] = amount;
      }
    }

    const rows = [
      ...toRows("workspace", wsRes.data as RawSubscription[] | null),
      ...toRows("talent", talentRes.data as RawSubscription[] | null),
    ];

    const now = new Date();
    return {
      ...computePlatformMrr(rows, index, now),
      churn: computeChurn(rows, now),
      compedWorkspaceCount: wsOverrideRes.count ?? 0,
      compedTalentCount: talentOverrideRes.count ?? 0,
      degraded: Boolean(wsRes.error || talentRes.error || priceRes.error),
    };
  } catch (err) {
    logServerError("billing.platform-mrr.load", err);
    return EMPTY_SNAPSHOT;
  }
}
