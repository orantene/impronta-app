"use server";

/**
 * Payments & providers — read-only settings action.
 *
 * Gated the same as any settings read (`agency.workspace.view`, the default
 * on `requireWorkspaceStaffAction`): every staff member can see which
 * providers are ready, nobody needs to be an owner to know why a card
 * declined at the counter this morning.
 *
 * Returns booleans and closed reason codes only — see provider-status.ts's
 * header for why a secret never crosses this boundary.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { computeProviderStatuses, readProviderStatusEnv, type ProviderStatus } from "@/lib/payments/provider-status";

export type PaymentProviderStatusResult =
  | { ok: true; providers: ProviderStatus[] }
  | { ok: false; error: string };

export async function getPaymentProviderStatus(): Promise<PaymentProviderStatusResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, providers: computeProviderStatuses(readProviderStatusEnv()) };
}
