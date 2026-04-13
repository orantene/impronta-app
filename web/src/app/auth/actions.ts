"use server";

import {
  getSiteUrl,
  normalizeNextPath,
  resolvePostAuthDestination,
} from "@/lib/auth-flow";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { loadAccessProfile } from "@/lib/access-profile";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type AuthActionState = { error?: string; message?: string } | void;

/** Unauthenticated: request Supabase to email a password reset link. */
export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }

  const origin = getSiteUrl();
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

  const supabase = await createClient();
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

  const supabase = await createClient();
  if (!supabase) {
    return { error: SUPABASE_ENV_HELP };
  }
  const origin = getSiteUrl();
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
    return { error: CLIENT_ERROR.signUp };
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
  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}
