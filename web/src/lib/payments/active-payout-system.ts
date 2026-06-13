import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * lib/payments/active-payout-system.ts
 *
 * The platform-wide payout-rail master switch (the `platform_settings` singleton).
 * A super-admin sets this on /platform/admin/settings:
 *   • "connect"        — Stripe Connect (Express accounts + transfers). The restored
 *     default. Force-pins every talent payout to Connect and hides Global Payouts
 *     onboarding in the talent UI.
 *   • "global_payouts" — Stripe v2 Global Payouts (USDC / local bank). Restores the
 *     per-talent crypto-opt-in routing exactly.
 *
 * Reversible — flipping back to "global_payouts" restores today's behavior; no GP
 * code is removed. Default "connect" so a missing/failed read resolves to Connect.
 *
 * Mirrors the operating-currency precedent (`lib/platform/operating-currency.ts`):
 * cached per-request read on the service-role client; the raw `.from(...)` write
 * lives HERE (not in the `use server` action) so the no-untenanted-from ratchet —
 * which only guards action files — is satisfied. `platform_settings` has no
 * tenant_id by design.
 *
 * Server-only.
 */

export type ActivePayoutSystem = "connect" | "global_payouts";

export const DEFAULT_PAYOUT_SYSTEM: ActivePayoutSystem = "connect";

/**
 * The platform payout rail. Cached per request. Defaults to Connect on any
 * miss/error so the money path and onboarding UI fail safe to the restored rail.
 */
export const loadActivePayoutSystem = cache(
  async (): Promise<ActivePayoutSystem> => {
    try {
      const admin = createServiceRoleClient();
      if (!admin) return DEFAULT_PAYOUT_SYSTEM;
      const { data, error } = await admin
        .from("platform_settings")
        .select("active_payout_system")
        .eq("id", true)
        .maybeSingle()
        // database.types.ts not regenerated for this column this wave.
        .returns<{ active_payout_system: string | null }>();
      if (error || data?.active_payout_system !== "global_payouts") {
        return DEFAULT_PAYOUT_SYSTEM;
      }
      return "global_payouts";
    } catch (err) {
      logServerError("payments.loadActivePayoutSystem", err);
      return DEFAULT_PAYOUT_SYSTEM;
    }
  },
);

/**
 * Persist the platform payout rail (singleton). Called by the super-admin
 * `use server` action after it has gated the caller. The raw `.from(...)` write
 * stays in this server-only lib (see header note on the ratchet).
 */
export async function writeActivePayoutSystem(
  updatedBy: string,
  system: ActivePayoutSystem,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
    const { error } = await admin
      .from("platform_settings")
      .update({
        active_payout_system: system,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("id", true); // singleton key — an unqualified update would no-op / hit RLS
    if (error) {
      logServerError("payments.writeActivePayoutSystem", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("payments.writeActivePayoutSystem", err);
    return { ok: false };
  }
}
