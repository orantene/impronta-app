"use server";

/**
 * Talent self — server actions for the talent currently signed in.
 *
 * Used by surfaces (OfferTab, talent inbox, settings) that need a
 * cheap snapshot of the talent's own state without re-loading the
 * full RSC tree.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

export type TalentPayoutSnapshot = {
  hasProfile: boolean;
  status: "none" | "pending" | "enabled" | "restricted" | "disabled";
  pendingPayouts: number;
};

/** Item #7 wiring: load the signed-in talent's Stripe Connect Express
 *  account status. Returns hasProfile=false when the user has no
 *  talent_profiles row (pure client / admin-only users). The
 *  PayoutNudgeCard auto-hides on status=enabled or hasProfile=false. */
export async function loadCurrentTalentPayoutSnapshot(): Promise<TalentPayoutSnapshot> {
  try {
    const session = await getCachedActorSession();
    if (!session?.user) {
      return { hasProfile: false, status: "none", pendingPayouts: 0 };
    }
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { hasProfile: false, status: "none", pendingPayouts: 0 };
    }
    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id, stripe_account_status")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!tp) {
      return { hasProfile: false, status: "none", pendingPayouts: 0 };
    }
    return {
      hasProfile: true,
      status: ((tp.stripe_account_status as TalentPayoutSnapshot["status"] | null) ?? "none"),
      pendingPayouts: 0, // future: query accepted-but-unpaid bookings
    };
  } catch (err) {
    logServerError("talent-self.loadPayoutSnapshot", err);
    return { hasProfile: false, status: "none", pendingPayouts: 0 };
  }
}
