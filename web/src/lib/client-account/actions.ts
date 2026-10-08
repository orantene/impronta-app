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
 *
 * TUL-173: Google (after same-origin `/auth/google?popup=1`) and password use
 * the same non-redirecting attach path. No new account types.
 *
 * Session note (Google popup): completing OAuth on this host replaces any prior
 * session cookie on the same host. If a talent/staff was signed in, finalize
 * with `signOutIfNotClient: true` signs that business session out after the
 * eligibility check — intentional, but operators should know.
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
import { hasSignupAcceptance, recordSignupAcceptance } from "@/lib/legal/acceptances";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import {
  authGoogleFinalizeUserKey,
  authOtpVerifyEmailKey,
  authPasswordEmailKey,
  authPasswordIpKey,
  checkAuthGoogleFinalizeByUser,
  checkAuthOtpVerifyByEmail,
  checkAuthPasswordByEmail,
  checkAuthPasswordByIp,
} from "@/lib/rate-limit-kv";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError, logServerExpected } from "@/lib/server/safe-error";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createTranslator } from "@/i18n/messages";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { marketingConsentPatch } from "./consent-pure";
import {
  chooseTrustedHost,
  isAuthEmailConfirmedForClaim,
  isClientAccountEligible,
  isClientAuthMethod,
  precheckSignIn,
  shouldClaimInquiriesForSignIn,
  shouldSignOutAfterVerify,
  userHasGoogleIdentity,
  type ClientAuthMethod,
  verifyIpRateKey,
} from "./pure";
import { ensureTenantClientRelationship } from "./relationship.server";
import { accountSurfaceEnabledForRequest, resolveAccountTenant } from "./tenant.server";

export type VerifyClientCodeResult =
  | { ok: true; firstSignIn: boolean }
  | { ok: false; error: string };

export type ClientAccountSignInResult = VerifyClientCodeResult;

const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const VERIFY_PER_EMAIL = 10;
const VERIFY_PER_IP = 30;
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_PER_EMAIL = 10;
const PASSWORD_PER_IP = 30;
const GOOGLE_FINALIZE_WINDOW_MS = 15 * 60 * 1000;
const GOOGLE_FINALIZE_PER_USER = 10;

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

function isRejectedCredentials(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === "invalid_credentials") return true;
  const message = (error as { message?: string })?.message;
  return typeof message === "string" && message.includes("Invalid login credentials");
}

/**
 * Shared post-auth attach for code / password / Google. Caller already has a
 * verified Supabase session for `userId`. Never creates a new account type.
 *
 * Claim / relink only run when the email is confirmed (OTP proves it;
 * password / Google / Apple must pass `emailConfirmed`). Apple private-relay
 * addresses skip claim. Sign-in still succeeds if claim is skipped.
 *
 * Shared by Google + password now; Apple (#2818) rebases onto this helper.
 */
async function completeClientAccountSignIn(input: {
  userId: string;
  email: string | null;
  locale: string;
  ageTerms: boolean;
  method: ClientAuthMethod;
  /** OTP proves email; password/Google/Apple supply `isAuthEmailConfirmedForClaim`. */
  emailConfirmed: boolean;
  /** When true (email-code path), claim even if email_confirmed_at lags. */
  otpProven?: boolean;
  /** When true, sign out a non-client session that this call just minted. */
  signOutIfNotClient: boolean;
  /**
   * Password path: never reveal account-type to the client (oracle). Log the
   * distinction server-side only and return the generic sign-in error.
   */
  genericNotClientError?: boolean;
}): Promise<ClientAccountSignInResult> {
  const t = createTranslator(input.locale === "es" ? "es" : "en");
  const generic = t("public.clientAccount.genericError");
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, error: generic };

  const profile = await loadAccessProfile(supabase, input.userId);
  if (!isClientAccountEligible(profile?.app_role)) {
    if (input.signOutIfNotClient) await supabase.auth.signOut();
    if (input.genericNotClientError) {
      logServerExpected("clientAccount/notClient", {
        message: `role=${profile?.app_role ?? "null"} method=${input.method}`,
      });
      return { ok: false, error: t("public.auth.actions.signInGeneric") };
    }
    return { ok: false, error: t("public.clientAccount.notClient") };
  }

  const mayClaim = shouldClaimInquiriesForSignIn({
    otpProven: input.otpProven === true,
    email: input.email,
    emailConfirmed: input.emailConfirmed,
  });
  if (mayClaim) {
    await relinkFirstConfirmedClaim(input.userId);
    const adminForClaim = createServiceRoleClient();
    const claimEmail = normalizeAuthEmail(input.email ?? "");
    if (adminForClaim && claimEmail) {
      await claimInquiriesByConfirmedEmail({
        admin: adminForClaim,
        userId: input.userId,
        verifiedEmail: claimEmail,
      }).catch((e) => logServerError("clientAccount/claimByEmail", e));
    }
  }

  // Age/terms: record ONLY when the UI checkbox was ticked (never hard-code).
  // New clients without a prior acceptance must tick; returning clients who
  // already accepted may proceed without re-ticking.
  if (input.ageTerms === true) {
    await recordSignupAcceptance(input.userId);
  } else {
    const already = await hasSignupAcceptance(input.userId);
    if (already === false) {
      if (input.signOutIfNotClient) await supabase.auth.signOut();
      return { ok: false, error: t("public.auth.actions.ageTermsRequired") };
    }
  }

  const admin = createServiceRoleClient();
  const host = await requestHost();
  const tenant = await resolveAccountTenant();
  if (tenant) {
    await ensureTenantClientRelationship({
      userId: input.userId,
      tenantId: tenant.tenantId,
      originDomain: host || null,
    });
  }

  let firstSignIn = false;
  if (admin) {
    const { count, error: countErr } = await admin
      .from("client_auth_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId);
    firstSignIn = !countErr && (count ?? 0) === 0;
    const authMethod = isClientAuthMethod(input.method) ? input.method : "email_code";
    const { error: insErr } = await admin
      .from("client_auth_events")
      .insert({ user_id: input.userId, host: host || "unknown", method: authMethod });
    if (insErr) logServerError("clientAccount/authEvent", insErr);
  }
  revalidatePath("/", "layout");
  return { ok: true, firstSignIn };
}

async function refuseIfBusinessSession(
  locale: string,
): Promise<ClientAccountSignInResult | null> {
  const t = createTranslator(locale === "es" ? "es" : "en");
  const generic = t("public.clientAccount.genericError");
  if (!clientAccountEnabledFor("talent")) return { ok: false, error: generic };
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, error: generic };
  const prior = await supabase.auth.getUser().catch(() => null);
  const priorUser = prior?.data?.user ?? null;
  if (!priorUser) return null;
  const priorProfile = await loadAccessProfile(supabase, priorUser.id);
  if (precheckSignIn({ signedIn: true, appRole: priorProfile?.app_role }) === "business_session") {
    return { ok: false, error: t("public.clientAccount.signedInAsTalent") };
  }
  return null;
}

export async function verifyClientAccountCode(input: {
  email: string;
  code: string;
  locale: string;
  ageTerms: boolean;
}): Promise<VerifyClientCodeResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const t = createTranslator(input.locale === "es" ? "es" : "en");
  const generic = t("public.clientAccount.genericError");
  // Flag off: the surface does not exist, so the action refuses too.
  if (!(await accountSurfaceEnabledForRequest())) return { ok: false, error: generic };

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

  const business = await refuseIfBusinessSession(input.locale);
  if (business) return business;

  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, error: generic };
  const prior = await supabase.auth.getUser().catch(() => null);
  const priorUser = prior?.data?.user ?? null;

  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    if (error) logServerError("clientAccount/verifyCode", error);
    return { ok: false, error: error ? t(otpVerifyErrorKey(error)) : generic };
  }

  return completeClientAccountSignIn({
    userId: data.user.id,
    email: data.user.email ?? email,
    locale: input.locale,
    ageTerms: input.ageTerms,
    method: "email_code",
    // OTP proves the mailbox; claim may run even if email_confirmed_at lags.
    emailConfirmed: true,
    otpProven: true,
    signOutIfNotClient: shouldSignOutAfterVerify(priorUser !== null),
  });
}

/**
 * Password sign-in for the popover. Same attach rules as the code path; never
 * redirects (talent hosts have no post-auth dashboard route).
 */
export async function signInClientAccountPassword(input: {
  email: string;
  password: string;
  locale: string;
  ageTerms: boolean;
}): Promise<ClientAccountSignInResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const t = createTranslator(input.locale === "es" ? "es" : "en");
  const generic = t("public.clientAccount.genericError");
  if (!clientAccountEnabledFor("talent")) return { ok: false, error: generic };

  const email = normalizeAuthEmail(input.email);
  const password = String(input.password ?? "");
  if (!email || !isValidAuthEmail(email) || !password) {
    return { ok: false, error: t("public.auth.actions.emailPasswordRequired") };
  }

  const tooMany = { ok: false, error: t("public.auth.passwordless.errors.tooMany") } as const;
  const ip = await requestIp();
  if (
    !tryConsumeRateLimit(`auth-password:${email}`, PASSWORD_PER_EMAIL, PASSWORD_WINDOW_MS) ||
    !tryConsumeRateLimit(`auth-password-ip:${ip}`, PASSWORD_PER_IP, PASSWORD_WINDOW_MS)
  ) {
    return tooMany;
  }
  const durableEmail = await checkAuthPasswordByEmail(authPasswordEmailKey(email));
  if (!durableEmail.ok) return tooMany;
  const durableIp = await checkAuthPasswordByIp(authPasswordIpKey(ip));
  if (!durableIp.ok) return tooMany;

  const business = await refuseIfBusinessSession(input.locale);
  if (business) return business;

  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, error: generic };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error) {
      if (isRejectedCredentials(error)) logServerExpected("clientAccount/password", error);
      else logServerError("clientAccount/password", error);
    }
    return { ok: false, error: t("public.auth.actions.signInGeneric") };
  }

  return completeClientAccountSignIn({
    userId: data.user.id,
    email: data.user.email ?? email,
    locale: input.locale,
    ageTerms: input.ageTerms,
    method: "password",
    emailConfirmed: isAuthEmailConfirmedForClaim(data.user),
    signOutIfNotClient: true,
    genericNotClientError: true,
  });
}

/**
 * After the Google popup writes a session on this host, attach the client
 * account side-effects without navigating away.
 *
 * Requires a real Google identity on the session. Rate-limited per user so
 * repeated finalize calls cannot spam `client_auth_events` / claims.
 */
export async function finalizeClientAccountGoogleSession(input: {
  locale: string;
  ageTerms: boolean;
}): Promise<ClientAccountSignInResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const t = createTranslator(input.locale === "es" ? "es" : "en");
  const generic = t("public.clientAccount.genericError");
  if (!clientAccountEnabledFor("talent")) return { ok: false, error: generic };

  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, error: generic };
  const got = await supabase.auth.getUser().catch(() => null);
  const user = got?.data?.user ?? null;
  if (!user) return { ok: false, error: t("public.clientAccount.googleFailed") };

  if (!userHasGoogleIdentity(user)) {
    logServerExpected("clientAccount/googleFinalize", { message: "missing_google_identity" });
    return { ok: false, error: t("public.clientAccount.googleFailed") };
  }

  const tooMany = { ok: false, error: t("public.auth.passwordless.errors.tooMany") } as const;
  if (
    !tryConsumeRateLimit(
      `auth-google-finalize:${user.id}`,
      GOOGLE_FINALIZE_PER_USER,
      GOOGLE_FINALIZE_WINDOW_MS,
    )
  ) {
    return tooMany;
  }
  const durable = await checkAuthGoogleFinalizeByUser(authGoogleFinalizeUserKey(user.id));
  if (!durable.ok) return tooMany;

  return completeClientAccountSignIn({
    userId: user.id,
    email: user.email ?? null,
    locale: input.locale,
    ageTerms: input.ageTerms,
    method: "google",
    emailConfirmed: isAuthEmailConfirmedForClaim(user),
    signOutIfNotClient: true,
  });
}

/** Asked once, at first sign-in. Unchecked by default; only ever writes the caller's own row. */
export async function saveClientMarketingConsent(optIn: boolean): Promise<{ ok: boolean }> {
  if (!(await assertNotImpersonating()).ok) return { ok: false };
  if (!(await accountSurfaceEnabledForRequest())) return { ok: false };
  const supabase = await getCachedServerSupabase();
  const { data } = (await supabase?.auth.getUser().catch(() => null)) ?? { data: null };
  const userId = data?.user?.id;
  const admin = createServiceRoleClient();
  if (!userId || !admin) return { ok: false };
  const { data: prior, error: priorErr } = await admin.from("client_profiles").select("marketing_opt_in").eq("user_id", userId).maybeSingle();
  if (priorErr) {
    logServerError("clientAccount/consentPrior", priorErr);
    return { ok: false };
  }
  const { error } = await admin
    .from("client_profiles")
    .update({
      marketing_opt_in: optIn === true,
      ...marketingConsentPatch({
        previous: (prior as { marketing_opt_in?: boolean | null } | null)?.marketing_opt_in,
        next: optIn === true,
        nowIso: new Date().toISOString(),
      }),
    })
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
