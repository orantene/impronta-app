import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { shouldActivateGuestBooker } from "./guest-activate";

/**
 * Marks a verified guest booker's account active. Best-effort: a failure is
 * logged and never blocks the sign-in. Returns true only when the row changed.
 */
export async function activateGuestBookerIfEligible(
  admin: SupabaseClient,
  input: { userId: string; emailProven: boolean },
): Promise<boolean> {
  if (!input.emailProven) return false;
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("app_role, account_status")
    .eq("id", input.userId)
    .maybeSingle<{ app_role: string | null; account_status: string | null }>();
  if (profErr) {
    logServerError("clientAccount/guestActivate/profile", profErr);
    return false;
  }
  if (profile?.app_role !== "client" || profile.account_status !== "onboarding") return false;
  const { count, error: countErr } = await admin
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("client_user_id", input.userId);
  if (countErr) {
    logServerError("clientAccount/guestActivate/bookings", countErr);
    return false;
  }
  if (!shouldActivateGuestBooker({ emailProven: true, appRole: profile.app_role, accountStatus: profile.account_status, hasBooking: (count ?? 0) > 0 })) return false;
  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("profiles")
    .update({ account_status: "active", onboarding_completed_at: now, updated_at: now })
    .eq("id", input.userId)
    .eq("account_status", "onboarding");
  if (updErr) {
    logServerError("clientAccount/guestActivate/update", updErr);
    return false;
  }
  return true;
}
