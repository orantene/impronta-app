/**
 * TUL-1291 · "Choose Free" from the upgrade modal (changeWorkspacePlan) wrote agencies.plan_tier directly and never
 * contacted Stripe, so a paid workspace kept being charged for the plan it thought it had left (and the next subscription
 * webhook wrote the old tier back). This is the pure core that puts Stripe first, through the SAME door commitPlanDowngrade
 * uses (applyWorkspaceDowngrade: cancel at period end, schedule released first, idempotent keys, fail closed):
 *   - live Stripe subscription: Stripe is told first and the caller writes NOTHING local. The webhook is the single
 *     writer of plan_tier, and archives the overflow roster at period end under the keep-list stored with the pending
 *     change. This door only runs when the roster fits the Free cap (keep-list = everyone); an overflowing roster is
 *     refused here and goes through the owner's keep-list picker (commitPlanDowngrade), so nobody is hidden by a guess.
 *   - no live subscription (free, comped, ended at Stripe): the direct write the action always did.
 * A Stripe refusal stops everything: the plan is not changed and the user is told, never silently "downgraded".
 */
export type FreeDowngradeDeps = {
  /** Active + pending roster ids, oldest first. Throws on an unreadable roster (fail closed, nothing is sent to Stripe). */
  listRosterIds(tenantId: string): Promise<string[]>;
  freeSeatCap(): number | null;
  newEventId(): string;
  nowIso(): string;
  applyAtStripe(
    tenantId: string,
    pending: { target_tier: string; keep_ids: string[]; archive_event_id: string; requested_by: string; requested_at: string },
  ): Promise<
    | { ok: true; hadSubscription: false }
    | { ok: true; hadSubscription: true; mode: "schedule" | "cancel_at_period_end"; effectiveAt: string | null }
    | { ok: false; error: string }
  >;
  /** The direct write for a workspace Stripe does not bill. */
  writeFreeNow(tenantId: string): Promise<{ ok: true } | { ok: false }>;
};

import { resolveKeepList } from "./downgrade-keep-list";

export type FreeDowngradeOutcome =
  | { ok: true; applied: "now" }
  | { ok: true; applied: "period_end"; effectiveAt: string | null }
  | { ok: false; error: string; needsKeepList?: boolean };

const FAIL = { ok: false as const, error: "Could not update plan. Try again." };

export async function downgradeWorkspaceToFree(
  tenantId: string,
  actorUserId: string,
  deps: FreeDowngradeDeps,
): Promise<FreeDowngradeOutcome> {
  let ids: string[];
  try {
    ids = await deps.listRosterIds(tenantId);
  } catch {
    return FAIL;
  }
  // TUL-1291: a roster above the Free cap needs the OWNER's keep-list (commitPlanDowngrade, from the picker). This door
  // never guesses who to hide: with an overflow it refuses and the UI opens the picker.
  const resolved = resolveKeepList({ rosterIds: ids, cap: deps.freeSeatCap() });
  if (!resolved.ok) return { ok: false, error: resolved.error, needsKeepList: resolved.code === "needs_selection" };
  const keep = resolved.keep;

  const stripe = await deps.applyAtStripe(tenantId, {
    target_tier: "free",
    keep_ids: keep,
    archive_event_id: deps.newEventId(),
    requested_by: actorUserId,
    requested_at: deps.nowIso(),
  });
  if (!stripe.ok) return { ok: false, error: stripe.error };
  if (stripe.hadSubscription) return { ok: true, applied: "period_end", effectiveAt: stripe.effectiveAt };

  const wrote = await deps.writeFreeNow(tenantId);
  return wrote.ok ? { ok: true, applied: "now" } : FAIL;
}
