"use server";

import { revalidatePath } from "next/cache";
import { userHasEmailPasswordIdentity } from "@/lib/auth-identities";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type StaffAccountPasswordState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

const MIN_PASSWORD_LEN = 8;

export async function updateStaffAccountPassword(
  _prev: StaffAccountPasswordState,
  formData: FormData,
): Promise<StaffAccountPasswordState> {
  const auth = await requireStaff();
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
    logServerError("admin/account/updatePassword", updateErr);
    return { error: CLIENT_ERROR.generic };
  }

  revalidatePath("/admin", "layout");
  return { success: true, message: "Password updated." };
}

export async function setStaffAccountPasswordOAuthOnly(
  _prev: StaffAccountPasswordState,
  formData: FormData,
): Promise<StaffAccountPasswordState> {
  const auth = await requireStaff();
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
    logServerError("admin/account/setPasswordOAuth", updateErr);
    return { error: CLIENT_ERROR.generic };
  }

  revalidatePath("/admin", "layout");
  return {
    success: true,
    message: "Password saved. You can also sign in with email and this password.",
  };
}
