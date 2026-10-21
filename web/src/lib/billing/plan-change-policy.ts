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
import { PLAN_CATALOG, isKnownPlan } from "@/lib/access/plan-catalog";
import type { BillingInterval } from "@/lib/pricing/interval-pricing";

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
};

export function planChangeMetadata(s: Pick<PlanChangeSubject, "toPlan" | "toInterval">): Record<string, string> {
  return { plan_key: s.toPlan, billing_interval: s.toInterval };
}

/** stripe.invoices.createPreview params for an immediate change. */
export function buildPreviewParams(s: PlanChangeSubject, prorationDate: number) {
  return {
    customer: s.customerId,
    subscription: s.subscriptionId,
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
  step: "update" | "schedule_create" | "schedule_update" | "schedule_release";
}): string {
  return `plan_change_${input.step}_${input.subscriptionId}_${input.toPlan}_${input.toInterval}_${input.prorationDate}`;
}

// ─── Result shapes shared with the UI ────────────────────────────────────────

export type PlanChangePreview =
  | {
      ok: true;
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
    }
  | { ok: false; error: string; code?: PlanChangeErrorCode };

export type PlanChangeErrorCode = "no_subscription" | "stale_preview" | "no_price" | "not_allowed" | "stripe";

export type PlanChangeConfirm =
  | { ok: true; kind: PlanChangeKind; timing: PlanChangeTiming; effectiveAt: string | null }
  /** `definite` is false only when Stripe may still have applied the change (timeout / network / 5xx); omitted = definite. */
  | { ok: false; error: string; code?: PlanChangeErrorCode; definite?: boolean };

/** Which confirm sentence the modal shows (keys under `planChange` in messages). */
export function planChangeCopyKey(p: { kind: PlanChangeKind; timing: PlanChangeTiming; cancelsPendingChange?: boolean }):
  | "payToday"
  | "changesOn"
  | "cancelPending"
  | "noChange" {
  if (p.kind === "noop") return p.cancelsPendingChange ? "cancelPending" : "noChange";
  return p.timing === "now" ? "payToday" : "changesOn";
}
