import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { claimEverythingForVerifiedEmail } from "@/lib/inquiry/claim-everything";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { activateGuestBookerIfEligible } from "./guest-activate.server";
import { isApplePrivateRelayEmail } from "./pure";

/**
 * G1 + G2 + G3 (client-guest-flow audit 2026-10-13): the ONE step every
 * client sign-in path runs after the email is proven and BEFORE the post-auth
 * destination is resolved. Claims every guest-era record tied to the verified
 * email, then activates a guest booker so they skip /onboarding/role.
 *
 * Client accounts only: staff and talent sign-ins return untouched. Safe to
 * run on every sign-in (idempotent); best-effort, never blocks the sign-in.
 */
export async function claimAndActivateVerifiedClient(input: {
  userId: string;
  email: string | null | undefined;
  /** OTP, email link, email_confirmed_at or a provider identity with email_verified. */
  emailProven: boolean;
  admin?: SupabaseClient | null;
}): Promise<{ activated: boolean }> {
  const none = { activated: false };
  if (!input.emailProven) return none;
  const email = (input.email ?? "").trim().toLowerCase();
  if (!input.userId || !email || isApplePrivateRelayEmail(email)) return none;
  try {
    const admin = input.admin ?? createServiceRoleClient();
    if (!admin) return none;
    const { data: profile, error } = await admin
      .from("profiles")
      .select("app_role")
      .eq("id", input.userId)
      .maybeSingle<{ app_role: string | null }>();
    if (error) {
      logServerError("clientAccount/afterVerifiedSignIn/profile", error);
      return none;
    }
    if (profile?.app_role !== "client") return none;
    await claimEverythingForVerifiedEmail({ admin, userId: input.userId, verifiedEmail: email });
    const activated = await activateGuestBookerIfEligible(admin, { userId: input.userId, emailProven: true });
    return { activated };
  } catch (e) {
    logServerError("clientAccount/afterVerifiedSignIn", e);
    return none;
  }
}
