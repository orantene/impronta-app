"use server";

import {
  getAppUrl,
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { loadAccessProfile } from "@/lib/access-profile";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { createTranslator } from "@/i18n/messages";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type AuthActionState = { error?: string; message?: string } | void;

function authT(formData: FormData) {
  const locale = String(formData.get("locale") ?? "en");
  return createTranslator(locale === "es" ? "es" : "en");
}

/** Maps Supabase auth error codes to actionable user-facing messages. */
function mapSignUpError(error: unknown, t: ReturnType<typeof createTranslator>): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case "email_address_invalid":
      return t("public.auth.actions.signupEmailInvalid");
    case "email_address_not_authorized":
      return t("public.auth.actions.signupDomainBlocked");
    case "weak_password":
      return t("public.auth.actions.signupWeakPassword");
    case "over_email_send_rate_limit":
      return t("public.auth.actions.signupRateLimited");
    case "user_already_exists":
    case "email_exists":
      return t("public.auth.actions.signupExists");
    case "signup_disabled":
      return t("public.auth.actions.signupDisabled");
    default:
      return t("public.auth.actions.signupGeneric");
  }
}

/** Unauthenticated: request Supabase to email a password reset link. */
export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const t = authT(formData);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: t("public.auth.actions.invalidEmail") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }

  const origin = getAppUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/update-password")}`,
  });

  if (error) {
    logServerError("auth/requestPasswordReset", error);
    // Same message either way to avoid account enumeration.
  }

  return {
    message: t("public.auth.actions.resetSent"),
  };
}

export async function signInWithEmail(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const t = authT(formData);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: t("public.auth.actions.emailPasswordRequired") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logServerError("auth/signInWithPassword", error);
    return { error: t("public.auth.actions.signInGeneric") };
  }

  const nextPath = normalizeNextPath(String(formData.get("next") ?? "").trim());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileData = user
    ? await loadAccessProfile(supabase, user.id)
    : null;

  revalidatePath("/", "layout");
  redirect(resolvePostAuthDestination(profileData, nextPath));
}

export async function signUpWithEmail(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const t = authT(formData);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: t("public.auth.actions.emailPasswordRequired") };
  }
  if (password.length < 8) {
    return { error: t("public.auth.actions.passwordTooShort") };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }
  const origin = getAppUrl();
  const nextPath = normalizeNextPath(String(formData.get("next") ?? "").trim());
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (error) {
    logServerError("auth/signUpWithEmail", error);
    return { error: mapSignUpError(error, t) };
  }

  if (!data.session) {
    return {
      message: t("public.auth.actions.signupConfirmation"),
    };
  }

  revalidatePath("/", "layout");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileData = user
    ? await loadAccessProfile(supabase, user.id)
    : null;
  redirect(resolvePostAuthDestination(profileData, nextPath));
}

export async function signOut(): Promise<void> {
  const supabase = await getCachedServerSupabase();
  if (supabase) {
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}
