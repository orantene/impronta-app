"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { userHasEmailPasswordIdentity } from "@/lib/auth-identities";
import { requireClient } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type ClientAccountPasswordState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

export type ClientDeleteAccountState = undefined | { error: string };

const DELETE_ACCOUNT_CONFIRMATION = "DELETE";

const MIN_PASSWORD_LEN = 8;

/**
 * Permanently deletes the authenticated client’s Auth user (cascades profile, client_profiles,
 * saves, etc.). Requires service role key on the server.
 */
export async function deleteClientAccount(
  _prev: ClientDeleteAccountState,
  formData: FormData,
): Promise<ClientDeleteAccountState> {
  const auth = await requireClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const confirm = String(formData.get("confirm_delete") ?? "").trim();
  if (confirm !== DELETE_ACCOUNT_CONFIRMATION) {
    return {
      error: `Type ${DELETE_ACCOUNT_CONFIRMATION} in capital letters to confirm you want to delete your account and data.`,
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      error:
        "Account deletion is not available in this environment. Add SUPABASE_SERVICE_ROLE_KEY on the server or contact support.",
    };
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    logServerError("client/account/deleteUser", delErr);
    return {
      error:
        delErr.message ||
        "Could not delete your account. Try again shortly or contact support.",
    };
  }

  try {
    await supabase.auth.signOut();
  } catch {
    /* session may already be invalid */
  }

  revalidatePath("/", "layout");
  redirect("/?account_closed=1");
}

export async function updateClientAccountPassword(
  _prev: ClientAccountPasswordState,
  formData: FormData,
): Promise<ClientAccountPasswordState> {
  const auth = await requireClient();
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
    logServerError("client/account/updatePassword", updateErr);
    return { error: CLIENT_ERROR.generic };
  }

  revalidatePath("/client", "layout");
  return { success: true, message: "Password updated." };
}

export async function setClientAccountPasswordOAuthOnly(
  _prev: ClientAccountPasswordState,
  formData: FormData,
): Promise<ClientAccountPasswordState> {
  const auth = await requireClient();
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
    logServerError("client/account/setPasswordOAuth", updateErr);
    return { error: CLIENT_ERROR.generic };
  }

  revalidatePath("/client", "layout");
  return {
    success: true,
    message: "Password saved. You can also sign in with email and this password.",
  };
}
