/**
 * plan-change-pending.ts (TUL-831): the pending (period-end) plan change of a subscription, and undoing it.
 *
 * A downgrade is stored at Stripe in one of two shapes, and both are "a change that has not happened yet":
 *   - to a lower PAID plan: a subscription schedule whose second phase carries the new plan;
 *   - to FREE: `cancel_at_period_end` (Stripe ends the subscription, the deleted webhook drops the talent to Free).
 * Undoing it is the matching single call: release the schedule, or clear the cancel flag. Nothing is refunded or
 * charged either way, and no plan row is written here (the webhook stays the single writer).
 */
import type Stripe from "stripe";

import { isDefiniteStripeFailure } from "./stripe-failure";
import { isCancellationPending, resumeSubscriptionParams } from "./pending-cancellation";
import { planChangeIdempotencyKey, FREE_TALENT_PLAN_KEY } from "./plan-change-policy";
import { iso, readCurrent, type PlanChangeStripe } from "./plan-change";

export type PendingPlanChange = {
  /** `talent_basic` for a pending end of the paid plan. */
  toPlan: string;
  /** ISO moment the new plan starts. */
  effectiveAt: string;
};

type ScheduleLike = Pick<Stripe.SubscriptionSchedule, "phases"> | null;

/**
 * Pure: what is waiting to happen to this subscription. `schedule` is the expanded schedule object (or null).
 * A schedule with fewer than two phases, or whose last phase has already started, is not pending.
 */
export function pendingChangeOf(sub: Stripe.Subscription, schedule: ScheduleLike, nowMs: number = Date.now()): PendingPlanChange | null {
  if (isCancellationPending(sub, new Date(nowMs))) {
    const end = sub.cancel_at ?? sub.items?.data?.[0]?.current_period_end ?? null;
    return end ? { toPlan: FREE_TALENT_PLAN_KEY, effectiveAt: iso(end) } : null;
  }
  const phases = schedule?.phases ?? [];
  if (phases.length < 2) return null;
  const next = phases[phases.length - 1];
  const toPlan = next.metadata?.plan_key;
  if (!toPlan || next.start_date * 1000 <= nowMs) return null;
  return { toPlan, effectiveAt: iso(next.start_date) };
}

type PendingRequest = {
  kind: "talent" | "workspace";
  subjectId: string;
  subscriptionId: string;
  onError?: (context: string, err: unknown) => void;
};

export async function loadPendingPlanChange(
  stripe: PlanChangeStripe,
  req: PendingRequest,
  nowMs: number = Date.now(),
): Promise<{ ok: true; pending: PendingPlanChange | null } | { ok: false; error: string }> {
  try {
    const sub = await stripe.subscriptions.retrieve(req.subscriptionId, { expand: ["items.data.price", "schedule"] });
    const c = readCurrent(sub, req.kind, req.subjectId);
    if (typeof c === "string") return { ok: false, error: c };
    const schedule = typeof sub.schedule === "object" && sub.schedule !== null ? sub.schedule : null;
    return { ok: true, pending: pendingChangeOf(sub, schedule, nowMs) };
  } catch (err) {
    req.onError?.("billing.planChange.pending.read", err);
    return { ok: false, error: "We could not read your plan change. Try again." };
  }
}

/** "Cancelar cambio": put the subscription back to renewing on its current plan. One Stripe write, no charge. */
export async function cancelPendingPlanChange(
  stripe: PlanChangeStripe,
  req: PendingRequest,
  nowMs: number = Date.now(),
): Promise<{ ok: true; hadPending: boolean } | { ok: false; error: string; definite?: boolean }> {
  try {
    const sub = await stripe.subscriptions.retrieve(req.subscriptionId, { expand: ["items.data.price"] });
    const c = readCurrent(sub, req.kind, req.subjectId);
    if (typeof c === "string") return { ok: false, error: c };
    const key = (step: "schedule_release" | "cancel_pending") =>
      planChangeIdempotencyKey({
        subscriptionId: sub.id,
        toPlan: c.fromPlan || "current",
        toInterval: c.fromInterval,
        prorationDate: Math.floor(nowMs / 60_000),
        step,
      });
    if (c.scheduleId) {
      // Releasing keeps the subscription exactly as it is today and drops the second phase.
      await stripe.subscriptionSchedules.release(c.scheduleId, {}, { idempotencyKey: key("schedule_release") });
      return { ok: true, hadPending: true };
    }
    if (isCancellationPending(sub, new Date(nowMs))) {
      await stripe.subscriptions.update(sub.id, resumeSubscriptionParams(sub), { idempotencyKey: key("cancel_pending") });
      return { ok: true, hadPending: true };
    }
    return { ok: true, hadPending: false };
  } catch (err) {
    req.onError?.("billing.planChange.pending.cancel", err);
    return { ok: false, error: "We could not cancel the change. Try again.", definite: isDefiniteStripeFailure(err) };
  }
}
