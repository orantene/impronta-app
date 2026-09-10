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
 *
 * A REFUSAL IS A CODE, NOT A SENTENCE, for the same reason as `pos-modes.ts`:
 * `auth.error` is English prose written for a log, and this card is read in
 * three languages. `PaymentsProvidersCard` renders the sentence; the English
 * reason goes to the server log.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { computeProviderStatuses, readProviderStatusEnv, type ProviderStatus } from "@/lib/payments/provider-status";
// `"use server"` files may export nothing but async functions — the id list is
// in a pure module (see `lib/settings/refusals.ts`).
import type { PaymentProviderRefusal } from "@/lib/settings/refusals";

export type PaymentProviderStatusResult =
  | { ok: true; providers: ProviderStatus[] }
  | { ok: false; reason: PaymentProviderRefusal };

export async function getPaymentProviderStatus(): Promise<PaymentProviderStatusResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    logServerError("payment-providers.getPaymentProviderStatus.denied", auth.error);
    return { ok: false, reason: "not_allowed" };
  }
  return { ok: true, providers: computeProviderStatuses(readProviderStatusEnv()) };
}
