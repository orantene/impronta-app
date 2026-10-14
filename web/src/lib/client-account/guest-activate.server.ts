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
  const hasBooking = await hasClientHistory(admin, input.userId);
  if (hasBooking === null) return false;
  if (!shouldActivateGuestBooker({ emailProven: true, appRole: profile.app_role, accountStatus: profile.account_status, hasBooking })) return false;
  // TUL-669: ensure_profile_for_current_user recomputes account_status on
  // every request and keeps a client 'active' only while a client_profiles row
  // exists. Create it first, or the next page load puts them back to
  // 'onboarding'. ignoreDuplicates keeps any settings the client already saved.
  const { error: cpErr } = await admin
    .from("client_profiles")
    .upsert({ user_id: input.userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (cpErr) {
    logServerError("clientAccount/guestActivate/clientProfile", cpErr);
    return false;
  }
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

/**
 * G2 (TUL-465): any guest-era record the claim attached counts as history:
 * an inquiry, a booking, a payment, or an order through an owned customer.
 * Run AFTER claimEverythingForVerifiedEmail. Null when a read failed.
 */
async function hasClientHistory(admin: SupabaseClient, userId: string): Promise<boolean | null> {
  const owned: Array<[string, string]> = [
    ["inquiries", "client_user_id"],
    ["agency_bookings", "client_user_id"],
    ["booking_transactions", "payer_user_id"],
  ];
  for (const [table, col] of owned) {
    const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(col, userId);
    if (error) {
      logServerError(`clientAccount/guestActivate/${table}`, error);
      return null;
    }
    if ((count ?? 0) > 0) return true;
  }
  const { data: customers, error: custErr } = await admin.from("customers").select("id").eq("user_id", userId);
  if (custErr) {
    logServerError("clientAccount/guestActivate/customers", custErr);
    return null;
  }
  const customerIds = ((customers ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (!customerIds.length) return false;
  const { count, error: ordErr } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("customer_id", customerIds);
  if (ordErr) {
    logServerError("clientAccount/guestActivate/orders", ordErr);
    return null;
  }
  return (count ?? 0) > 0;
}

/**
 * TUL-771: someone who signed up through the CLIENT door (`/register?as=client`)
 * and proved the email already said they are a client; asking again at
 * `/onboarding/role` is a dead step. Same activation as a guest booker (the
 * client_profiles row first, TUL-669), but the explicit sign-up choice stands
 * in for a booking. Only a fresh `client` + `onboarding` profile changes: a
 * talent, staff or already-active account is never touched.
 */
export async function activateClientSignup(
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
    logServerError("clientAccount/clientSignup/profile", profErr);
    return false;
  }
  if (profile?.app_role !== "client" || profile.account_status !== "onboarding") return false;
  const { error: cpErr } = await admin
    .from("client_profiles")
    .upsert({ user_id: input.userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (cpErr) {
    logServerError("clientAccount/clientSignup/clientProfile", cpErr);
    return false;
  }
  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("profiles")
    .update({ account_status: "active", onboarding_completed_at: now, updated_at: now })
    .eq("id", input.userId)
    .eq("app_role", "client")
    .eq("account_status", "onboarding");
  if (updErr) {
    logServerError("clientAccount/clientSignup/update", updErr);
    return false;
  }
  return true;
}
