"use server";

/**
 * Onboarding module — the account step, code only.
 *
 * Email → 8-digit code, through the same `signInWithOtp` the auth surface
 * uses (`requestEmailCode`, create allowed), so a new address gets the signup
 * mail and an existing one gets the magic-link mail: the screen is identical
 * for both, nothing reveals whether an address is registered. The verify step
 * mirrors `submitEmailCode` (same ceilings, same `verifyOtp`) but returns
 * state instead of redirecting, claims the guest brief onto the new user, and
 * promotes a talent-path signup to `app_role = 'talent'` the way the OAuth
 * callback does. Google runs through the existing popup (`/auth/google`).
 */

import { requestEmailCode, type EmailCodeState } from "@/app/auth/otp-actions";
import { relinkFirstConfirmedClaim } from "@/lib/auth/guest-claim-relink";
import {
  isCompleteOtpCode,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeOtpCode,
  otpVerifyErrorKey,
} from "@/lib/auth/otp-flow";
import { createTranslator } from "@/i18n/messages";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { authOtpVerifyEmailKey, checkAuthOtpVerifyByEmail } from "@/lib/rate-limit-kv";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { promoteFreshProfileToTalent } from "@/lib/auth/promote-talent-signup";
import { getOnboardingFlags } from "@/lib/settings/onboarding-flags";
import { claimTulalaBriefOnAuth } from "@/lib/tulala/brief-claim-auth";
import type { OnboardingPath } from "@/lib/onboarding/module-state";

const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const VERIFY_PER_EMAIL = 10;

export type RequestCodeResult =
  | { ok: true; email: string; resent: boolean }
  | { ok: false; code: "module_off" | "invalid_email" | "too_many" | "send_failed"; message: string };

export async function requestOnboardingCode(input: {
  email: string;
  locale: "en" | "es";
  resend?: boolean;
}): Promise<RequestCodeResult> {
  if (!(await getOnboardingFlags()).onboarding_module_enabled) {
    return { ok: false, code: "module_off", message: "" };
  }
  const t = createTranslator(input.locale);
  const email = normalizeAuthEmail(input.email);
  if (!email || !isValidAuthEmail(email)) {
    return { ok: false, code: "invalid_email", message: t("public.auth.actions.invalidEmail") };
  }
  const form = new FormData();
  form.set("email", email);
  form.set("locale", input.locale);
  form.set("create", "1");
  form.set("next", "/");
  if (input.resend) form.set("resend", "1");
  const state: EmailCodeState = await requestEmailCode(undefined, form);
  if (!state || state.step === "sent") return { ok: true, email, resent: !!input.resend };
  const tooMany = state.error === t("public.auth.passwordless.errors.tooMany");
  return { ok: false, code: tooMany ? "too_many" : "send_failed", message: state.error };
}

export type VerifyCodeResult =
  | { ok: true; userId: string; email: string; briefId: string | null }
  | { ok: false; code: "module_off" | "invalid" | "too_many" | "wrong_code" | "failed"; message: string };

export async function verifyOnboardingCode(input: {
  email: string;
  code: string;
  locale: "en" | "es";
  path: OnboardingPath;
}): Promise<VerifyCodeResult> {
  if (!(await getOnboardingFlags()).onboarding_module_enabled) {
    return { ok: false, code: "module_off", message: "" };
  }
  const t = createTranslator(input.locale);
  const email = normalizeAuthEmail(input.email);
  const code = normalizeOtpCode(input.code);
  if (!email || !isValidAuthEmail(email)) {
    return { ok: false, code: "invalid", message: t("public.auth.actions.invalidEmail") };
  }
  if (!isCompleteOtpCode(code)) {
    return { ok: false, code: "invalid", message: t("public.auth.passwordless.errors.codeRequired") };
  }
  if (!tryConsumeRateLimit(`auth-otp-verify:${email}`, VERIFY_PER_EMAIL, VERIFY_WINDOW_MS)) {
    return { ok: false, code: "too_many", message: t("public.auth.passwordless.errors.tooMany") };
  }
  const verifyByEmail = await checkAuthOtpVerifyByEmail(authOtpVerifyEmailKey(email));
  if (!verifyByEmail.ok) {
    return { ok: false, code: "too_many", message: t("public.auth.passwordless.errors.tooMany") };
  }
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false, code: "failed", message: t("public.auth.passwordless.errors.verifyFailed") };

  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    logServerError("onboarding/verifyOnboardingCode", error ?? new Error("no user"));
    return { ok: false, code: "wrong_code", message: t(error ? otpVerifyErrorKey(error) : "public.auth.passwordless.errors.generic") };
  }
  const user = data.user;

  // The guest brief becomes this person's brief: same id, same module_state.
  const claimed = await claimTulalaBriefOnAuth(supabase, user.id);
  await relinkFirstConfirmedClaim(user.id);

  // A person building their own page is a talent from the first minute, the
  // same promotion the OAuth callback does for a talent-onboarding `next`.
  if (input.path !== "business") await promoteFreshProfileToTalent(user.id);

  return { ok: true, userId: user.id, email: user.email ?? email, briefId: claimed.briefId };
}
