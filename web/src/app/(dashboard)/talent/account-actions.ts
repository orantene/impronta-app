"use server";

import { revalidatePath } from "next/cache";
import { getSiteUrl } from "@/lib/auth-flow";
import { userHasEmailPasswordIdentity } from "@/lib/auth-identities";
import { requireTalent } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type TalentAccountActionState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

const MIN_PASSWORD_LEN = 8;

export async function updateTalentAccountDisplayName(
  _prev: TalentAccountActionState,
  formData: FormData,
): Promise<TalentAccountActionState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const display_name = String(formData.get("display_name") ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: display_name.length > 0 ? display_name : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    logServerError("talent/account/updateDisplayName", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/talent", "layout");
  return { success: true, message: "Display name saved." };
}

export async function updateTalentAccountEmail(
  _prev: TalentAccountActionState,
  formData: FormData,
): Promise<TalentAccountActionState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  const current = user.email?.toLowerCase() ?? "";
  if (email === current) {
    return { success: true, message: "That is already your account email." };
  }

  const origin = getSiteUrl();
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/talent/account")}` },
  );

  if (error) {
    logServerError("talent/account/updateEmail", error);
    return { error: CLIENT_ERROR.generic };
  }

  revalidatePath("/talent", "layout");
  return {
    success: true,
    message:
      "Confirmation sent. Check your new inbox (and the old one) to finish changing your email.",
  };
}

export async function updateTalentAccountPassword(
  _prev: TalentAccountActionState,
  formData: FormData,
): Promise<TalentAccountActionState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const current_password = String(formData.get("current_password") ?? "");
  const new_password = String(formData.get("new_password") ?? "");
  const confirm_password = String(formData.get("confirm_password") ?? "");

  if (!current_password || !new_password || !confirm_password) {
    return { error: "Fill in current password, new password, and confirmation." };
  }
  if (new_password.length < MIN_PASSWORD_LEN) {
    return { error: `New password must be at least ${MIN_PASSWORD_LEN} characters.` };
  }
  if (new_password !== confirm_password) {
    return { error: "New password and confirmation do not match." };
  }
  if (new_password === current_password) {
    return { error: "New password must be different from your current password." };
  }

  const email = user.email;
  if (!email) {
    return { error: "No email on this account; use Forgot password on the login page." };
  }

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: current_password,
  });
  if (signInErr) {
    return { error: "Current password is incorrect." };
  }

  const { error: updateErr } = await supabase.auth.updateUser({
    password: new_password,
  });
  if (updateErr) {
    logServerError("talent/account/updatePassword", updateErr);
    return { error: CLIENT_ERROR.generic };
  }

  revalidatePath("/talent", "layout");
  return { success: true, message: "Password updated." };
}

/** OAuth-only talent: add email+password login without proving an existing password. */
export async function setTalentAccountPasswordOAuthOnly(
  _prev: TalentAccountActionState,
  formData: FormData,
): Promise<TalentAccountActionState> {
  const auth = await requireTalent();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  if (userHasEmailPasswordIdentity(user)) {
    return {
      error:
        "Your account already uses an email password. Use “Change password” with your current password below.",
    };
  }

  const new_password = String(formData.get("new_password") ?? "");
  const confirm_password = String(formData.get("confirm_password") ?? "");

  if (!new_password || !confirm_password) {
    return { error: "Enter and confirm your new password." };
  }
  if (new_password.length < MIN_PASSWORD_LEN) {
    return { error: `Password must be at least ${MIN_PASSWORD_LEN} characters.` };
  }
  if (new_password !== confirm_password) {
    return { error: "Password and confirmation do not match." };
  }

  const {
    data: { user: fresh },
  } = await supabase.auth.getUser();
  if (!fresh || userHasEmailPasswordIdentity(fresh)) {
    return {
      error:
        "Your sign-in method changed. Refresh the page and use the password form that matches your account.",
    };
  }

  const { error: updateErr } = await supabase.auth.updateUser({
    password: new_password,
  });
  if (updateErr) {
    logServerError("talent/account/setPasswordOAuth", updateErr);
    return { error: CLIENT_ERROR.generic };
  }

  revalidatePath("/talent", "layout");
  return {
    success: true,
    message: "Password saved. You can also sign in with email and this password.",
  };
}
