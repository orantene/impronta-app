"use server";

/**
 * Platform Admin — held-payouts reconciliation actions.
 *
 * Lets a super_admin manually re-attempt held payout legs from the Commerce
 * console (alongside the automatic account.updated release + the daily
 * reconcile cron). Gated to `super_admin`.
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { logServerError } from "@/lib/server/safe-error";
import { releaseHeldPayouts } from "@/lib/payments/booking-payouts-ledger";

type RetryResult =
  | { ok: true; released: number; stillHeld: number; failed: number }
  | { ok: false; error: string };

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden — platform admin only." };
  }
  return { ok: true };
}

/**
 * Re-attempt the held/failed payout legs for ONE payee (talent or workspace).
 * Returns the aggregate outcome counts.
 */
export async function retryHeldPayoutsForPayee(
  target: { talentProfileId?: string | null; tenantId?: string | null },
): Promise<RetryResult> {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return guard;
    if (!target.talentProfileId && !target.tenantId) {
      return { ok: false, error: "No payee specified." };
    }

    const outcomes = await releaseHeldPayouts(target);
    const released = outcomes.filter((o) => o.result === "released").length;
    const stillHeld = outcomes.filter((o) => o.result === "still_held").length;
    const failed = outcomes.filter((o) => o.result === "failed").length;

    revalidatePath("/platform/admin/commerce");
    return { ok: true, released, stillHeld, failed };
  } catch (err) {
    logServerError("platform.held-payouts.retry", err);
    return { ok: false, error: "Unexpected error." };
  }
}
