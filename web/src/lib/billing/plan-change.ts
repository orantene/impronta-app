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
  type PlanChangePreview,
  type PlanChangeSubject,
} from "./plan-change-policy";

/** The narrow slice of the Stripe SDK this module calls. */
export type PlanChangeStripe = {
  subscriptions: Pick<Stripe["subscriptions"], "retrieve" | "update">;
  invoices: Pick<Stripe["invoices"], "createPreview">;
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
    const base = { kind: policy.kind, timing: policy.timing, prorationDate, cancelsPendingChange: c.scheduleId !== null };
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
    return {
      ok: true,
      ...base,
      amountDueToday: invoice.amount_due,
      currency: invoice.currency,
      effectiveAt: null,
    };
  } catch {
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
      planChangeIdempotencyKey({ subscriptionId: c.sub.id, toPlan: req.toPlan, toInterval: req.toInterval, prorationDate, step });

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
  } catch {
    return { ok: false, error: "We could not change your plan. Try again.", code: "stripe" };
  }
}
