"use server";

/**
 * Server actions behind the client account popover (talent sites).
 *
 * Sending the code reuses `requestEmailCode` from `app/auth/otp-actions.ts`
 * untouched. Verifying cannot reuse `submitEmailCode`: that action ALWAYS
 * redirects to a post-auth destination (`/client`, `/onboarding`...) which does
 * not exist on a talent host, and the popover must stay on the page. So this
 * file verifies with the same Supabase call, the same rate limits and the same
 * claim helpers, then returns data instead of redirecting.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { loadAccessProfile } from "@/lib/access-profile";
import { relinkFirstConfirmedClaim } from "@/lib/auth/guest-claim-relink";
import {
  isCompleteOtpCode,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeOtpCode,
  otpVerifyErrorKey,
} from "@/lib/auth/otp-flow";
import { claimInquiriesByConfirmedEmail } from "@/lib/inquiry/claim-by-email";
import { isAgeAndTermsConfirmed } from "@/lib/legal/acceptances.core";
import { recordSignupAcceptance } from "@/lib/legal/acceptances";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { authOtpVerifyEmailKey, checkAuthOtpVerifyByEmail } from "@/lib/rate-limit-kv";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createTranslator } from "@/i18n/messages";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { clientAccountEnabledFor } from "./flag";
import { chooseTrustedHost, isClientAccountEligible, precheckSignIn, shouldSignOutAfterVerify, verifyIpRateKey } from "./pure";
import { ensureTenantClientRelationship } from "./relationship.server";
import { resolveAccountTenant } from "./tenant.server";

export type VerifyClientCodeResult =
  | { ok: true; firstSignIn: boolean }
  | { ok: false; error: string };

const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const VERIFY_PER_EMAIL = 10;
const VERIFY_PER_IP = 30;

async function requestHost(): Promise<string> {
  try {
    return chooseTrustedHost((await headers()).get("host")) ?? "";
  } catch {
    return "";
  }
}

async function requestIp(): Promise<string> {
  try {
    const forwarded = (await headers()).get("x-forwarded-for") ?? "";
    return forwarded.split(",")[0]?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export async function verifyClientAccountCode(input: {
  email: string;
  code: string;
  locale: string;
  ageTerms: boolean;
}): Promise<VerifyClientCodeResult> {
  const t = createTranslator(input.locale === "es" ? "es" : "en");
  const generic = t("public.clientAccount.genericError");
  // Flag off: the surface does not exist, so the action refuses too.
  if (!clientAccountEnabledFor("talent")) return { ok: false, error: generic };

  const email = normalizeAuthEmail(input.email);
  const code = normalizeOtpCode(input.code);
  if (!email || !isValidAuthEmail(email)) return { ok: false, error: t("public.auth.actions.invalidEmail") };
  if (!isCompleteOtpCode(code)) return { ok: false, error: t("public.auth.passwordless.errors.codeRequired") };

  const tooMany = { ok: false, error: t("public.auth.passwordless.errors.tooMany") } as const;
  if (
    !tryConsumeRateLimit(`auth-otp-verify:${email}`, VERIFY_PER_EMAIL, VERIFY_WINDOW_MS) ||
    !tryConsumeRateLimit(verifyIpRateKey(await requestIp()), VERIFY_PER_IP, VERIFY_WINDOW_MS)
  ) {
    return tooMany;
  }
  const durable = await checkAuthOtpVerifyByEmail(authOtpVerifyEmailKey(email));
  if (!durable.ok) return tooMany;

  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, error: generic };
  // Existing business session (talent, staff, platform): never verify over it.
  const prior = await supabase.auth.getUser().catch(() => null);
  const priorUser = prior?.data?.user ?? null;
  if (priorUser) {
    const priorProfile = await loadAccessProfile(supabase, priorUser.id);
    if (precheckSignIn({ signedIn: true, appRole: priorProfile?.app_role }) === "business_session") {
      return { ok: false, error: t("public.clientAccount.signedInAsTalent") };
    }
  }

  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    if (error) logServerError("clientAccount/verifyCode", error);
    return { ok: false, error: error ? t(otpVerifyErrorKey(error)) : generic };
  }
  const user = data.user;

  // A talent, staff or platform email is never treated as a client here.
  const profile = await loadAccessProfile(supabase, user.id);
  if (!isClientAccountEligible(profile?.app_role)) {
    if (shouldSignOutAfterVerify(priorUser !== null)) await supabase.auth.signOut();
    return { ok: false, error: t("public.clientAccount.notClient") };
  }

  // Everything below runs ONLY after the code is verified.
  await relinkFirstConfirmedClaim(user.id);
  if (input.ageTerms) await recordSignupAcceptance(user.id);
  const admin = createServiceRoleClient();
  if (admin) {
    await claimInquiriesByConfirmedEmail({ admin, userId: user.id, verifiedEmail: email }).catch((e) =>
      logServerError("clientAccount/claimByEmail", e),
    );
  }
  const host = await requestHost();
  const tenant = await resolveAccountTenant();
  if (tenant) {
    await ensureTenantClientRelationship({ userId: user.id, tenantId: tenant.tenantId, originDomain: host || null });
  }

  let firstSignIn = false;
  if (admin) {
    const { count, error: countErr } = await admin
      .from("client_auth_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    firstSignIn = !countErr && (count ?? 0) === 0;
    const { error: insErr } = await admin
      .from("client_auth_events")
      .insert({ user_id: user.id, host: host || "unknown", method: "email_code" });
    if (insErr) logServerError("clientAccount/authEvent", insErr);
  }
  revalidatePath("/", "layout");
  return { ok: true, firstSignIn };
}

/** Asked once, at first sign-in. Unchecked by default; only ever writes the caller's own row. */
export async function saveClientMarketingConsent(optIn: boolean): Promise<{ ok: boolean }> {
  if (!(await assertNotImpersonating()).ok) return { ok: false };
  if (!clientAccountEnabledFor("talent")) return { ok: false };
  const supabase = await getCachedServerSupabase();
  const { data } = (await supabase?.auth.getUser().catch(() => null)) ?? { data: null };
  const userId = data?.user?.id;
  const admin = createServiceRoleClient();
  if (!userId || !admin) return { ok: false };
  const { error } = await admin
    .from("client_profiles")
    .update({ marketing_opt_in: optIn === true, marketing_opt_in_at: optIn === true ? new Date().toISOString() : null })
    .eq("user_id", userId);
  if (error) {
    logServerError("clientAccount/consent", error);
    return { ok: false };
  }
  return { ok: true };
}

export async function signOutClientAccount(): Promise<{ ok: boolean }> {
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false };
  const got = await supabase.auth.getUser().catch(() => null);
  const signedUser = got?.data?.user ?? null;
  if (signedUser) {
    const profile = await loadAccessProfile(supabase, signedUser.id);
    if (!isClientAccountEligible(profile?.app_role)) return { ok: false };
  }
  const { error } = await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return { ok: !error };
}
