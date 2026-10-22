/**
 * plan-change.ts (TUL-831): the Stripe side of an in-app plan change. The
 * Stripe client is passed in (the server action passes the real one, tests a
 * fake), so the orchestration is testable without network.
 *
 * Never writes plan rows: customer.subscription.updated and
 * subscription_schedule.* webhooks re-fetch the subscription and run the
 * single writer.
 */
import type Stripe from "stripe";

import { isDefiniteStripeFailure } from "./stripe-failure";
import { buildBreakdown, renewalAmount } from "./plan-change-breakdown";
import { computePromoPreview } from "./promo-preview";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";
import type { BillingInterval } from "@/lib/pricing/interval-pricing";
import {
  buildImmediateUpdateParams,
  buildPreviewParams,
  buildScheduleUpdateParams,
  isUsableProrationDate,
  nowProrationDate,
  planChangeIdempotencyKey,
  planChangePolicy,
  type PlanChangeConfirm,
  type PlanChangeDiscountEntry,
  type PlanChangePreview,
  type PlanChangeSubject,
} from "./plan-change-policy";

/** The narrow slice of the Stripe SDK this module calls. */
export type PlanChangeStripe = {
  subscriptions: Pick<Stripe["subscriptions"], "retrieve" | "update">;
  invoices: Pick<Stripe["invoices"], "createPreview">;
  /** TUL-1297: reads the target price's amount + currency for an interval change. */
  prices: Pick<Stripe["prices"], "retrieve">;
  subscriptionSchedules: Pick<Stripe["subscriptionSchedules"], "create" | "update" | "release" | "retrieve">;
};

export type PlanChangeRequest = {
  kind: "talent" | "workspace";
  subjectId: string;
  /** From our own row for this subject, never from the browser. */
  subscriptionId: string;
  toPlan: string;
  toInterval: BillingInterval;
  /** Catalog price for (toPlan, toInterval); null = not sold. */
  toPriceId: string | null;
  /** Server-side error sink so a swallowed Stripe failure still leaves a log line naming the step. */
  onError?: (context: string, err: unknown) => void;
  /**
   * TUL-833: a promo code the server already validated against our catalog
   * (see plan-change-promo.server.ts). Never built from a browser value.
   */
  promo?: PlanChangePromoInput | null;
};

export type PlanChangePromoInput = {
  entry: PlanChangeDiscountEntry;
  /** The catalog row, for the label and the renewal maths. */
  discount: PricingDiscountRow;
};

type Current = {
  sub: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
  fromPlan: string;
  fromInterval: BillingInterval;
  scheduleId: string | null;
};

const ACTIVE = new Set(["active", "trialing", "past_due"]);

function readCurrent(sub: Stripe.Subscription, kind: "talent" | "workspace", subjectId: string): Current | string {
  if (!ACTIVE.has(sub.status)) return "This plan is not active.";
  const owner = kind === "talent" ? sub.metadata?.talent_profile_id : sub.metadata?.tenant_id;
  // Legacy subscriptions may lack the id tag; when present it must match.
  if (owner && owner !== subjectId) return "This plan belongs to someone else.";
  const item = sub.items.data[0];
  if (!item || sub.items.data.length !== 1) return "This plan cannot be changed here.";
  const fromPlan = sub.metadata?.plan_key ?? sub.metadata?.talent_plan_key ?? "";
  const fromInterval: BillingInterval = item.price?.recurring?.interval === "year" ? "year" : "month";
  const scheduleId = typeof sub.schedule === "string" ? sub.schedule : (sub.schedule?.id ?? null);
  return { sub, item, fromPlan, fromInterval, scheduleId };
}

function subject(req: PlanChangeRequest, c: Current, toPriceId: string): PlanChangeSubject {
  return {
    discount: req.promo?.entry ?? null,
    kind: req.kind,
    subjectId: req.subjectId,
    subscriptionId: c.sub.id,
    customerId: typeof c.sub.customer === "string" ? c.sub.customer : c.sub.customer.id,
    itemId: c.item.id,
    toPlan: req.toPlan,
    toInterval: req.toInterval,
    toPriceId,
  };
}

/** A code is only meaningful on a change that bills now, and a second discount would replace the first. */
function promoRefusal(
  req: PlanChangeRequest,
  c: Current,
  policy: ReturnType<typeof planChangePolicy>,
): { ok: false; error: string; code: "promo"; promoError: "already_discounted" | "upgrade_now_only" } | null {
  if (!req.promo) return null;
  if (policy.timing !== "now" || policy.kind === "noop") {
    return { ok: false, error: "A code applies when you change plan now.", code: "promo", promoError: "upgrade_now_only" };
  }
  if ((c.sub.discounts?.length ?? 0) > 0) {
    return { ok: false, error: "Your plan already has a discount.", code: "promo", promoError: "already_discounted" };
  }
  return null;
}

/** Stripe refused the request itself (bad code, restriction), as opposed to a declined card or an outage. */
function isInvalidRequest(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { type?: unknown }).type === "StripeInvalidRequestError";
}

function discountKeyPart(entry: PlanChangeDiscountEntry): string {
  return "promotion_code" in entry ? entry.promotion_code : entry.coupon;
}

function iso(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

async function load(stripe: PlanChangeStripe, req: PlanChangeRequest): Promise<Current | string> {
  const sub = await stripe.subscriptions.retrieve(req.subscriptionId, { expand: ["items.data.price"] });
  return readCurrent(sub, req.kind, req.subjectId);
}

export async function previewPlanChange(
  stripe: PlanChangeStripe,
  req: PlanChangeRequest,
  nowMs: number = Date.now(),
): Promise<PlanChangePreview> {
  if (!req.toPriceId) return { ok: false, error: "This plan is not available for that billing period.", code: "no_price" };
  try {
    const c = await load(stripe, req);
    if (typeof c === "string") return { ok: false, error: c, code: "not_allowed" };
    const policy = planChangePolicy({ plan: c.fromPlan, interval: c.fromInterval }, { plan: req.toPlan, interval: req.toInterval });
    const prorationDate = nowProrationDate(nowMs);
    const base = {
      kind: policy.kind,
      timing: policy.timing,
      prorationDate,
      cancelsPendingChange: c.scheduleId !== null,
      fromInterval: c.fromInterval,
      toInterval: req.toInterval,
      newPrice: null as { amount: number; currency: string } | null,
    };
    const isIntervalChange = policy.kind === "interval_up" || policy.kind === "interval_down";
    if (isIntervalChange) {
      // Fail closed: no readable price, no preview (never a made-up number or a currency fallback).
      const price = await stripe.prices.retrieve(req.toPriceId);
      const currency = price.currency?.trim();
      if (price.unit_amount == null || !currency) {
        return { ok: false, error: "This plan is not available for that billing period.", code: "no_price" };
      }
      base.newPrice = { amount: price.unit_amount, currency };
    }
    const refused = promoRefusal(req, c, policy);
    if (refused) return refused;
    if (policy.timing === "period_end") {
      return {
        ok: true,
        ...base,
        cancelsPendingChange: false,
        amountDueToday: 0,
        currency: c.item.price.currency,
        effectiveAt: iso(c.item.current_period_end),
      };
    }
    if (policy.kind === "noop") {
      return { ok: true, ...base, amountDueToday: 0, currency: c.item.price.currency, effectiveAt: null };
    }
    const invoice = await stripe.invoices.createPreview(buildPreviewParams(subject(req, c, req.toPriceId), prorationDate));
    // TUL-831: the next renewal on the new price. Best effort; the line is simply hidden when the price is unreadable.
    let unit: number | null = base.newPrice && base.newPrice.currency === invoice.currency ? base.newPrice.amount : null;
    if (unit === null && !isIntervalChange) {
      try {
        const price = await stripe.prices.retrieve(req.toPriceId);
        unit = price.unit_amount != null && price.currency === invoice.currency ? price.unit_amount : null;
      } catch {
        unit = null;
      }
    }
    const breakdown = buildBreakdown(invoice, renewalAmount(unit, invoice.currency, req.promo?.discount ?? null));
    const promo = req.promo ? { code: req.promo.discount.code, label: computePromoPreview(req.promo.discount, 0).label } : null;
    // A trialing subscription keeps its trial: the new interval starts being billed when the trial ends.
    const trialEnd = c.sub.status === "trialing" ? c.sub.trial_end : null;
    return {
      ok: true,
      ...base,
      breakdown,
      promo,
      amountDueToday: invoice.amount_due,
      currency: invoice.currency,
      effectiveAt: isIntervalChange && trialEnd ? iso(trialEnd) : null,
    };
  } catch (err) {
    req.onError?.(`billing.planChange.preview.stripe kind=${req.kind} toPlan=${req.toPlan} toInterval=${req.toInterval}`, err);
    // A code Stripe refuses on this subscription (restriction we cannot see, e.g. a minimum) is the code's fault, not an outage.
    if (req.promo && isInvalidRequest(err)) {
      return { ok: false, error: "That code can't be applied to this change.", code: "promo", promoError: "not_applicable" };
    }
    return { ok: false, error: "We could not price this change. Try again.", code: "stripe" };
  }
}

export async function confirmPlanChange(
  stripe: PlanChangeStripe,
  req: PlanChangeRequest,
  prorationDate: unknown,
  nowMs: number = Date.now(),
): Promise<PlanChangeConfirm> {
  if (!req.toPriceId) return { ok: false, error: "This plan is not available for that billing period.", code: "no_price" };
  if (!isUsableProrationDate(prorationDate, nowMs)) {
    return { ok: false, error: "The price changed. Review it again.", code: "stale_preview" };
  }
  const toPriceId = req.toPriceId;
  try {
    const c = await load(stripe, req);
    if (typeof c === "string") return { ok: false, error: c, code: "not_allowed" };
    const policy = planChangePolicy({ plan: c.fromPlan, interval: c.fromInterval }, { plan: req.toPlan, interval: req.toInterval });
    const key = (step: Parameters<typeof planChangeIdempotencyKey>[0]["step"]) =>
      planChangeIdempotencyKey({
        subscriptionId: c.sub.id,
        toPlan: req.toPlan,
        toInterval: req.toInterval,
        prorationDate,
        step,
        discountId: req.promo ? discountKeyPart(req.promo.entry) : null,
      });
    const refused = promoRefusal(req, c, policy);
    if (refused) return refused;

    if (policy.timing === "now") {
      // Upgrading again (or going back to the current plan) cancels a pending
      // period-end downgrade first; releasing keeps the subscription as is.
      if (c.scheduleId) {
        await stripe.subscriptionSchedules.release(c.scheduleId, {}, { idempotencyKey: key("schedule_release") });
      }
      if (policy.kind === "noop") return { ok: true, kind: policy.kind, timing: "now", effectiveAt: null };
      await stripe.subscriptions.update(
        c.sub.id,
        buildImmediateUpdateParams(subject(req, c, toPriceId), prorationDate),
        { idempotencyKey: key("update") },
      );
      return { ok: true, kind: policy.kind, timing: "now", effectiveAt: null };
    }

    // Period end: reuse the pending schedule, or create one from the subscription.
    let scheduleId = c.scheduleId;
    let phaseStart = c.item.current_period_start;
    if (!scheduleId) {
      const created = await stripe.subscriptionSchedules.create(
        { from_subscription: c.sub.id },
        { idempotencyKey: key("schedule_create") },
      );
      scheduleId = created.id;
      phaseStart = created.phases[0]?.start_date ?? phaseStart;
    } else {
      const existing = await stripe.subscriptionSchedules.retrieve(scheduleId);
      phaseStart = existing.current_phase?.start_date ?? existing.phases[0]?.start_date ?? phaseStart;
    }
    await stripe.subscriptionSchedules.update(
      scheduleId,
      buildScheduleUpdateParams({
        currentPriceId: c.item.price.id,
        currentPhaseStart: phaseStart,
        currentPeriodEnd: c.item.current_period_end,
        toPriceId,
        toPlan: req.toPlan,
        toInterval: req.toInterval,
        trialEnd: c.sub.status === "trialing" ? (c.sub.trial_end ?? null) : null,
      }),
      { idempotencyKey: key("schedule_update") },
    );
    return { ok: true, kind: policy.kind, timing: "period_end", effectiveAt: iso(c.item.current_period_end) };
  } catch (err) {
    req.onError?.(`billing.planChange.confirm.stripe kind=${req.kind} toPlan=${req.toPlan} toInterval=${req.toInterval}`, err);
    if (req.promo && isInvalidRequest(err)) {
      return { ok: false, error: "That code can't be applied to this change.", code: "promo", promoError: "not_applicable", definite: true };
    }
    return { ok: false, error: "We could not change your plan. Try again.", code: "stripe", definite: isDefiniteStripeFailure(err) };
  }
}
