/**
 * plan-change-policy.ts (TUL-831): in-app plan change with proration, for
 * talent and workspace subscriptions. Pure: no Stripe client, no Supabase.
 *
 * Rules:
 *   - Higher plan rank (plan-catalog.ts) = upgrade: applied NOW with
 *     proration_behavior "always_invoice", so the difference is charged today.
 *   - Same plan, monthly -> yearly = interval_up: also now + always_invoice.
 *   - Lower plan rank = downgrade, and same plan yearly -> monthly =
 *     interval_down: applied at the END of the paid period through a
 *     subscription schedule (current price until current_period_end, then the
 *     new price). Nothing is refunded and nothing is charged today.
 *   - Same plan + same interval = noop.
 *
 * Preview and confirm share `prorationDate`, so what Stripe charges on confirm
 * equals what the preview showed. The idempotency key carries it too, so a
 * double click replays the same request instead of charging twice.
 *
 * These actions never write plan rows: the webhook (talent-plan-state.ts and
 * workspace-billing.ts) stays the single writer. We only stamp the new
 * plan_key / billing_interval into Stripe metadata (immediately, or on the
 * schedule's second phase) so the webhook reads the right plan.
 */
import type { PromoErrorCode } from "./promo-preview";
import { PLAN_CATALOG, isKnownPlan } from "@/lib/access/plan-catalog";
import type { BillingInterval } from "@/lib/pricing/interval-pricing";

/**
 * TUL-831: the free talent plan has no Stripe price. Switching to it is a
 * period-end cancel (`cancel_at_period_end`), never a schedule phase.
 */
export const FREE_TALENT_PLAN_KEY = "talent_basic";

export function isFreeTalentTarget(plan: string): boolean {
  return plan === FREE_TALENT_PLAN_KEY;
}

export type PlanChangeKind = "upgrade" | "downgrade" | "interval_up" | "interval_down" | "noop";
export type PlanChangeTiming = "now" | "period_end";

export type PlanPoint = { plan: string; interval: BillingInterval };

export type PlanChangePolicy = {
  kind: PlanChangeKind;
  timing: PlanChangeTiming;
  stripeParams: {
    /** Only for timing "now". */
    proration_behavior: "always_invoice" | "none";
    /** Immediate changes refuse to apply when the charge fails. */
    payment_behavior: "error_if_incomplete" | null;
    /** Period-end changes go through a subscription schedule. */
    useSchedule: boolean;
  };
};

/** Rank inside an audience; unknown plans rank -1 (always below a known plan). */
export function planRank(plan: string): number {
  return isKnownPlan(plan) ? PLAN_CATALOG[plan].rank : -1;
}

function intervalRank(interval: BillingInterval): number {
  return interval === "year" ? 1 : 0;
}

const NOW: PlanChangePolicy["stripeParams"] = {
  proration_behavior: "always_invoice",
  payment_behavior: "error_if_incomplete",
  useSchedule: false,
};
const AT_PERIOD_END: PlanChangePolicy["stripeParams"] = {
  proration_behavior: "none",
  payment_behavior: null,
  useSchedule: true,
};

export function planChangePolicy(from: PlanPoint, to: PlanPoint): PlanChangePolicy {
  const fromRank = planRank(from.plan);
  const toRank = planRank(to.plan);
  if (toRank > fromRank) return { kind: "upgrade", timing: "now", stripeParams: NOW };
  if (toRank < fromRank) return { kind: "downgrade", timing: "period_end", stripeParams: AT_PERIOD_END };
  // Same rank: only a different plan key of equal rank or the interval differs.
  const di = intervalRank(to.interval) - intervalRank(from.interval);
  if (di > 0) return { kind: "interval_up", timing: "now", stripeParams: NOW };
  if (di < 0) return { kind: "interval_down", timing: "period_end", stripeParams: AT_PERIOD_END };
  return { kind: "noop", timing: "now", stripeParams: { ...NOW, proration_behavior: "none", payment_behavior: null } };
}

// ─── Proration date ──────────────────────────────────────────────────────────

/** How long a preview's price stays valid for confirm. */
export const PRORATION_DATE_MAX_AGE_SECONDS = 15 * 60;

export function nowProrationDate(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000);
}

/**
 * The proration date comes back from the browser on confirm. Accept it only
 * when it is an integer, not in the future, and recent; otherwise the user
 * must preview again (the price they saw is stale).
 */
export function isUsableProrationDate(value: unknown, nowMs: number = Date.now()): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  const now = nowProrationDate(nowMs);
  return value <= now + 5 && now - value <= PRORATION_DATE_MAX_AGE_SECONDS;
}

// ─── Stripe param builders ───────────────────────────────────────────────────

export type PlanChangeSubject = {
  kind: "talent" | "workspace";
  subjectId: string;
  subscriptionId: string;
  customerId: string;
  /** The subscription item being swapped (single-item subscriptions). */
  itemId: string;
  toPlan: string;
  toInterval: BillingInterval;
  toPriceId: string;
  /**
   * TUL-833: a promo code already validated server-side, as the Stripe discount
   * entry to attach (promotion code preferred, coupon as the stub fallback).
   * Absent = no code. Never built from a browser value.
   */
  discount?: PlanChangeDiscountEntry | null;
};

export type PlanChangeDiscountEntry = { promotion_code: string } | { coupon: string };

/** `discounts` param fragment: empty (key absent) when there is no code, so a code-less call is byte-identical to before. */
export function discountParams(s: Pick<PlanChangeSubject, "discount">): { discounts?: PlanChangeDiscountEntry[] } {
  return s.discount ? { discounts: [s.discount] } : {};
}

/**
 * subscriptions.update params for "switch to Free": the subscription keeps its
 * paid price and plan metadata until the period ends, then Stripe ends it and
 * the `customer.subscription.deleted` webhook drops the talent to Free. No
 * proration, no refund, no invoice today.
 */
export function buildFreeDowngradeUpdateParams() {
  return { cancel_at_period_end: true as const };
}

export function planChangeMetadata(s: Pick<PlanChangeSubject, "toPlan" | "toInterval">): Record<string, string> {
  return { plan_key: s.toPlan, billing_interval: s.toInterval };
}

/** stripe.invoices.createPreview params for an immediate change. */
export function buildPreviewParams(s: PlanChangeSubject, prorationDate: number) {
  return {
    customer: s.customerId,
    subscription: s.subscriptionId,
    ...discountParams(s),
    subscription_details: {
      items: [{ id: s.itemId, price: s.toPriceId }],
      proration_behavior: "always_invoice" as const,
      proration_date: prorationDate,
    },
  };
}

/** stripe.subscriptions.update params for an immediate change. Same items + date as the preview. */
export function buildImmediateUpdateParams(s: PlanChangeSubject, prorationDate: number) {
  return {
    items: [{ id: s.itemId, price: s.toPriceId }],
    proration_behavior: "always_invoice" as const,
    proration_date: prorationDate,
    payment_behavior: "error_if_incomplete" as const,
    ...discountParams(s),
    metadata: planChangeMetadata(s),
  };
}

/**
 * subscriptionSchedules.update params: phase 1 keeps the current price until
 * the period ends, phase 2 moves to the new price and stamps the new plan into
 * subscription metadata. The schedule then releases, leaving a plain
 * subscription on the new price.
 */
export function buildScheduleUpdateParams(input: {
  currentPriceId: string;
  currentPhaseStart: number;
  currentPeriodEnd: number;
  toPriceId: string;
  toPlan: string;
  toInterval: BillingInterval;
  /**
   * The subscription's trial end (unix seconds) while it is trialing, else null.
   * A schedule update REPLACES the phases: without `trial_end` on the current
   * phase Stripe ends the trial on the spot and invoices the full price, while
   * the confirm step promised "nothing is charged today" (TUL-831, found on
   * localhost 2026-10-19: a trialing yearly plan was billed $150 on a
   * period-end downgrade).
   */
  trialEnd?: number | null;
}) {
  const keepTrial = input.trialEnd != null && input.trialEnd > input.currentPhaseStart;
  return {
    end_behavior: "release" as const,
    proration_behavior: "none" as const,
    phases: [
      {
        items: [{ price: input.currentPriceId, quantity: 1 }],
        start_date: input.currentPhaseStart,
        end_date: input.currentPeriodEnd,
        ...(keepTrial ? { trial_end: input.trialEnd as number } : {}),
      },
      {
        items: [{ price: input.toPriceId, quantity: 1 }],
        start_date: input.currentPeriodEnd,
        proration_behavior: "none" as const,
        metadata: planChangeMetadata(input),
      },
    ],
  };
}

/**
 * Stable per (subscription, target, proration date): a retried confirm with
 * the same preview replays; a new preview gets a new key.
 */
export function planChangeIdempotencyKey(input: {
  subscriptionId: string;
  toPlan: string;
  toInterval: BillingInterval;
  prorationDate: number;
  step: "update" | "schedule_create" | "schedule_update" | "schedule_release" | "downgrade_free" | "cancel_pending";
  /** TUL-833: the attached discount id, so a retry with a different code never replays another code's key. */
  discountId?: string | null;
}): string {
  const base = `plan_change_${input.step}_${input.subscriptionId}_${input.toPlan}_${input.toInterval}_${input.prorationDate}`;
  return input.discountId ? `${base}_${input.discountId}` : base;
}

// ─── Result shapes shared with the UI ────────────────────────────────────────

/**
 * TUL-831: the line items the confirm step shows before anything is charged.
 * Minor units in the invoice currency. `credit` and `charge` are positive
 * magnitudes; `discount` is the promo's cut of today's invoice (0 when none).
 * `total` is what Stripe will collect now (the preview invoice's amount_due).
 */
export type PlanChangeBreakdown = {
  credit: number;
  charge: number;
  discount: number;
  total: number;
  /** Next renewal amount on the new price, discount applied if it still lasts; null when unreadable. */
  renewal: number | null;
};

export type PlanChangePromo = { code: string; label: { en: string; es: string } };

export type PlanChangePreview =
  | {
      ok: true;
      /** TUL-831: undefined for period-end changes (nothing is charged today). */
      breakdown?: PlanChangeBreakdown;
      /** TUL-833: the validated code this preview priced, or null. */
      promo?: PlanChangePromo | null;
      kind: PlanChangeKind;
      timing: PlanChangeTiming;
      /** Minor units charged today (0 for period-end changes). */
      amountDueToday: number;
      currency: string;
      /** Unix seconds; send back on confirm. */
      prorationDate: number;
      /** ISO date the change applies (period end), or null for now. */
      effectiveAt: string | null;
      /** True when a period-end change is already scheduled and this confirm cancels it. */
      cancelsPendingChange: boolean;
      /** TUL-831: the plan the subscription is on now, so the sheet can say "until then you stay on X". */
      fromPlan?: string;
      /** TUL-1297: the subscription's current and requested billing interval. */
      fromInterval: BillingInterval;
      toInterval: BillingInterval;
      /**
       * TUL-1297: the target price (minor units + the Stripe price's own currency) for an interval change;
       * null for every other kind. Read from the same catalog price id checkout uses, never invented.
       */
      newPrice: { amount: number; currency: string } | null;
    }
  | { ok: false; error: string; code?: PlanChangeErrorCode; promoError?: PromoErrorCode };

export type PlanChangeErrorCode =
  | "no_subscription"
  | "stale_preview"
  | "no_price"
  | "not_allowed"
  | "stripe"
  /** TUL-833: the code was refused (unknown, expired, wrong plan, already discounted). */
  | "promo";

export type PlanChangeConfirm =
  | { ok: true; kind: PlanChangeKind; timing: PlanChangeTiming; effectiveAt: string | null }
  /** `definite` is false only when Stripe may still have applied the change (timeout / network / 5xx); omitted = definite. */
  | { ok: false; error: string; code?: PlanChangeErrorCode; definite?: boolean; promoError?: PromoErrorCode };

/** Which confirm sentence the modal shows (keys under `planChange` in messages). */
export function planChangeCopyKey(p: {
  kind: PlanChangeKind;
  timing: PlanChangeTiming;
  cancelsPendingChange?: boolean;
  amountDueToday?: number;
  effectiveAt?: string | null;
}):
  | "payToday"
  | "changesOn"
  | "downgradeAt"
  | "cancelPending"
  | "noChange"
  | "switchYearlyNow"
  | "switchYearlyAt"
  | "switchMonthlyAt" {
  if (p.kind === "noop") return p.cancelsPendingChange ? "cancelPending" : "noChange";
  // TUL-1297: an interval change names the new billing interval and its price.
  if (p.kind === "interval_down") return "switchMonthlyAt";
  if (p.kind === "interval_up") return (p.amountDueToday ?? 0) > 0 || !p.effectiveAt ? "switchYearlyNow" : "switchYearlyAt";
  if (p.kind === "downgrade" && p.timing === "period_end") return "downgradeAt";
  return p.timing === "now" ? "payToday" : "changesOn";
}
