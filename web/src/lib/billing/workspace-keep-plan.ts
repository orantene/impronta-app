/**
 * TUL-1914 · "Keep my plan" for a workspace whose Free downgrade is scheduled. The undo itself is the existing
 * cancelPendingPlanChangeFor("workspace", ...) (clear cancel_at_period_end, or release the schedule): no amount and no
 * new Stripe flow. After Stripe accepted, the stored keep-list row is dropped so it can never archive anyone later.
 * Nothing pending = no Stripe write and no local write. Pure with injected deps, so it is tested without Stripe.
 */
export type KeepWorkspacePlanDeps = {
  cancelPending(tenantId: string): Promise<{ ok: true; hadPending: boolean } | { ok: false; error: string }>;
  clearPending(tenantId: string): Promise<{ ok: true } | { ok: false }>;
  onClearFailed(tenantId: string): void;
};

export type KeepWorkspacePlanResult = { ok: true; hadPending: boolean } | { ok: false; error: string };

export async function keepWorkspacePlan(tenantId: string, deps: KeepWorkspacePlanDeps): Promise<KeepWorkspacePlanResult> {
  const out = await deps.cancelPending(tenantId);
  if (!out.ok) return { ok: false, error: out.error };
  if (!out.hadPending) return { ok: true, hadPending: false };
  // Stripe is already back to renewing. A failed row delete is logged, not shown as a failure of the undo.
  const cleared = await deps.clearPending(tenantId);
  if (!cleared.ok) deps.onClearFailed(tenantId);
  return { ok: true, hadPending: true };
}
