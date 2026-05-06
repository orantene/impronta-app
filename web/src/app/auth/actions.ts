"use server";

import {
  getAppUrl,
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { loadAccessProfile } from "@/lib/access-profile";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type AuthActionState = { error?: string; message?: string } | void;

/** Maps Supabase auth error codes to actionable user-facing messages. */
function mapSignUpError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case "email_address_invalid":
      return "That email address doesn't look right. Check the format and try again.";
    case "email_address_not_authorized":
      return "Signups aren't allowed for that email domain. Try a different address.";
    case "weak_password":
      return "Password is too weak. Use at least 8 characters, ideally mixing letters, numbers, and symbols.";
    case "over_email_send_rate_limit":
      return "Too many signup attempts for this address. Wait a few minutes and try again.";
    case "user_already_exists":
    case "email_exists":
      return "An account with that email already exists. Try signing in, or reset your password if you've forgotten it.";
    case "signup_disabled":
      return "New account signups are temporarily disabled. Contact us for access.";
    default:
      return CLIENT_ERROR.signUp;
  }
}

/** Unauthenticated: request Supabase to email a password reset link. */
export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
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
    message:
      "If an account exists for that address, we sent a link to reset your password. Check your inbox and spam folder.",
  };
}

export async function signInWithEmail(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logServerError("auth/signInWithPassword", error);
    return { error: CLIENT_ERROR.signIn };
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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
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
    return { error: mapSignUpError(error) };
  }

  if (!data.session) {
    return {
      message:
        "Account created. Check your email for the confirmation link, then continue signing in.",
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
