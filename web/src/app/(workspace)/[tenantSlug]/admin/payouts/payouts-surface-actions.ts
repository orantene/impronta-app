"use server";

/**
 * In-shell Payouts section loader.
 *
 * The Payouts surface now renders INSIDE the admin SPA shell (the
 * `PayoutsPage` page-module) rather than as a standalone server page. That
 * client component can't call the server `getConnectedAccountSnapshot` /
 * `loadWorkspaceBaseFee` helpers directly, so this server action gathers the
 * whole surface payload in one round-trip and hands it back.
 *
 * Capability gate: `agency.payout_account.manage` (owner-level) — the same
 * gate the old server page + the Connect onboarding action use. NOTE: the
 * signature is `userHasCapability(capability, tenantId)`; passing them in the
 * wrong order, or using an unregistered key, silently denies everyone.
 */

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getConnectedAccountSnapshot, type ConnectedAccountSnapshot } from "@/lib/payments/stripe-connect";
import { getHeldPayoutTotals } from "@/lib/payments/booking-payouts-ledger";
import { loadWorkspaceBaseFee, type WorkspaceBaseFeeState } from "./base-fee-actions";

export type PayoutsSurfaceResult =
  | { ok: true; data: PayoutsSurfaceData }
  | { ok: false; error: string };

export type PayoutsSurfaceData = {
  /**
   * Stripe Connect snapshot. `ok: false` carries the load error so the
   * page-module can show the same "couldn't load status" state the old
   * server page did, while still rendering the base-fee card.
   */
  connect:
    | { ok: true; data: ConnectedAccountSnapshot }
    | { ok: false; error: string };
  /** Workspace base reservation fee + platform caps. Pass-through. */
  baseFee:
    | { ok: true; data: WorkspaceBaseFeeState }
    | { ok: false; error: string };
  /** Held payout totals (earnings waiting on bank connection), by currency. */
  held: Array<{ currency: string; amountCents: number; count: number }>;
};

export async function loadPayoutsSurface(
  tenantSlug: string,
): Promise<PayoutsSurfaceResult> {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canEdit = await userHasCapability("agency.payout_account.manage", scope.tenantId);
  if (!canEdit) return { ok: false, error: "Forbidden — workspace admin only." };

  // Both reads gate on the same capability internally; run them together.
  const [connect, baseFee, held] = await Promise.all([
    getConnectedAccountSnapshot(tenantSlug),
    loadWorkspaceBaseFee(tenantSlug),
    getHeldPayoutTotals({ tenantId: scope.tenantId }),
  ]);

  return { ok: true, data: { connect, baseFee, held } };
}
