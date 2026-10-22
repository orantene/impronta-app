/**
 * TUL-1820 · after a confirmed IMMEDIATE in-app plan change, write the new
 * plan key to the plan row right away. `confirmPlanChange` only talks to
 * Stripe; the row used to be written by the webhook alone, so the
 * `router.refresh()` that closes the plan-change modal re-read the OLD
 * `talent_plan_key` and every plan label (rail chip, Settings row, modal
 * "current plan") stayed on the previous plan until a manual reload.
 *
 * Writes through the single plan-state writer (`syncTalentSubscriptionToDb`,
 * idempotent, so the late webhook replaying the same subscription is
 * harmless). Period-end changes and no-ops write nothing: the plan has not
 * changed yet. Never throws: the Stripe change already happened and the
 * webhook is the backstop.
 */
import type { PlanChangeConfirm } from "./plan-change-policy";
import { isFreeTalentTarget } from "./plan-change-policy";

export type PlanChangeSyncDeps<Sub> = {
  retrieveSubscription: (subscriptionId: string) => Promise<Sub>;
  syncToDb: (sub: Sub, planKey: string, opts: { eventType: string; talentProfileId: string }) => Promise<{ ok: boolean }>;
  onError: (context: string, err: unknown) => void;
};

export async function syncTalentPlanAfterConfirm<Sub>(
  deps: PlanChangeSyncDeps<Sub>,
  input: { subscriptionId: string; toPlan: string; talentProfileId: string },
  outcome: PlanChangeConfirm,
): Promise<{ synced: boolean }> {
  if (!outcome.ok || outcome.timing !== "now" || outcome.kind === "noop") return { synced: false };
  if (isFreeTalentTarget(input.toPlan)) return { synced: false };
  try {
    const sub = await deps.retrieveSubscription(input.subscriptionId);
    const res = await deps.syncToDb(sub, input.toPlan, { eventType: "sync", talentProfileId: input.talentProfileId });
    if (!res.ok) deps.onError("billing.planChange.syncAfterConfirm", new Error("plan row sync failed"));
    return { synced: res.ok };
  } catch (err) {
    deps.onError("billing.planChange.syncAfterConfirm", err);
    return { synced: false };
  }
}
