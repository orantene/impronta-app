import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Workspace plan-change producer (spec §6.6, Slice 15.4) — the REQUIRED
 * `billing` category. One entry point (`notifyWorkspacePlanChange`) derives the
 * right event type from the plan delta so the two disjoint code paths that
 * change a workspace's tier — the self-serve `cancelSubscription` action and
 * the Stripe `syncStripeSubscriptionToDb` webhook sync — can both call it
 * without duplicating the up/down/cancel logic.
 *
 * Both paths share a deterministic `eventId`
 * (`plan-change:<tenant>:<from>-><to>:<day>`): the same transition on the same
 * day collapses to a single delivery via the `dispatch_log` unique index (so a
 * webhook that races the in-app action doesn't double-email), while distinct
 * transitions never collide. Because the type is a pure function of
 * `(from, to)`, the same `eventId` always maps to the same event type — there
 * is no risk of two types sharing a dedupe key.
 */

const PLAN_RANK: Record<string, number> = { free: 0, studio: 1, agency: 2, network: 3 };

const norm = (plan: string | null | undefined): string => (plan ?? "").trim().toLowerCase();

/**
 * Map a plan transition to its billing event type, or null when no notice is
 * warranted (same tier, or an unrecognised target). Exported for unit testing.
 *
 *  - target `free`            → `workspace.subscription_cancelled` (full cancel)
 *  - target ranks ABOVE prior → `workspace.plan_upgraded`
 *  - target ranks BELOW prior → `workspace.plan_downgraded`
 *  - unknown prior            → treated as an upgrade (first paid subscription)
 *  - same tier / unknown to   → null (no emit)
 */
export function planChangeEventType(
  fromPlan: string | null | undefined,
  toPlan: string | null | undefined,
): "workspace.plan_upgraded" | "workspace.plan_downgraded" | "workspace.subscription_cancelled" | null {
  const to = norm(toPlan);
  const from = norm(fromPlan);
  if (!to) return null;
  if (to === "free") return "workspace.subscription_cancelled";
  const toRank = to in PLAN_RANK ? PLAN_RANK[to] : null;
  if (toRank == null) return null; // unrecognised paid tier — don't guess
  const fromRank = from && from in PLAN_RANK ? PLAN_RANK[from] : null;
  if (fromRank == null) return "workspace.plan_upgraded"; // no/unknown prior → first paid plan
  if (toRank > fromRank) return "workspace.plan_upgraded";
  if (toRank < fromRank) return "workspace.plan_downgraded";
  return null; // same tier — nothing to announce
}

/**
 * Emit the right plan-change billing notice for a workspace. No-ops (no
 * dispatch) when the transition warrants no notice. Fire-and-forget: a dispatch
 * failure logs only and never breaks the billing mutation that triggered it.
 */
export function notifyWorkspacePlanChange(params: {
  tenantId: string;
  fromPlan: string | null;
  toPlan: string | null;
  effectiveAtIso?: string | null;
  workspaceName?: string | null;
}): void {
  const type = planChangeEventType(params.fromPlan, params.toPlan);
  if (!type) return;

  const day = new Date().toISOString().slice(0, 10);
  const fromKey = norm(params.fromPlan) || "none";
  const toKey = norm(params.toPlan) || "none";

  void dispatchEventNotifications({
    type,
    tenantId: params.tenantId,
    eventId: `plan-change:${params.tenantId}:${fromKey}->${toKey}:${day}`,
    payload: {
      fromPlan: params.fromPlan,
      toPlan: params.toPlan,
      effectiveAt: params.effectiveAtIso ?? null,
      workspaceName: params.workspaceName ?? null,
    },
  }).catch((err) => {
    logServerError("notifyWorkspacePlanChange", err);
  });
}
