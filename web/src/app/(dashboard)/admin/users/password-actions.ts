"use server";

import { randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const TEMP_PASSWORD_CHARS =
  "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type AdminPasswordResetState =
  | undefined
  | { error: string }
  | { success: true; message: string; temporaryPassword?: string };

export type AdminLoginEmailUpdateState =
  | undefined
  | { error: string }
  | { success: true; message: string; newEmail: string };

const LOGIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTemporaryPassword(length = 20): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)];
  }
  return out;
}

async function assertTalentOrClientUserId(
  supabaseStaff: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error } = await supabaseStaff
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    logServerError("admin/password/targetProfile", error);
    return { ok: false, error: "Could not verify account." };
  }
  const role = row?.app_role as string | null | undefined;
  if (role !== "talent" && role !== "client") {
    return {
      ok: false,
      error: "Password reset is only available for talent and client accounts.",
    };
  }
  return { ok: true };
}

/** Staff-only: read login email from Auth (not stored on `profiles`). Requires service role key. */
export async function adminGetLoginEmailForStaff(
  userId: string,
): Promise<{ email: string | null }> {
  const staff = await requireStaff();
  if (!staff.ok) return { email: null };

  const id = userId.trim();
  if (!id) return { email: null };

  const admin = createServiceRoleClient();
  if (!admin) return { email: null };

  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error) {
    logServerError("adminGetLoginEmailForStaff/getUserById", error);
    return { email: null };
  }

  const email = data.user?.email?.trim().toLowerCase() ?? null;
  return { email };
}

/** Staff-only: change login email for a talent or client Auth user (requires service role key). */
export async function adminUpdateTalentClientLoginEmail(
  _prev: AdminLoginEmailUpdateState,
  formData: FormData,
): Promise<AdminLoginEmailUpdateState> {
  const staff = await requireStaff();
  if (!staff.ok) return { error: staff.error };

  const userId = String(formData.get("user_id") ?? "").trim();
  const newEmailRaw = String(formData.get("new_login_email") ?? "").trim().toLowerCase();
  if (!userId) return { error: "Missing user." };
  if (!newEmailRaw) return { error: "Enter the new email address." };
  if (!LOGIN_EMAIL_RE.test(newEmailRaw)) {
    return { error: "Enter a valid email address." };
  }

  const targetOk = await assertTalentOrClientUserId(staff.supabase, userId);
  if (!targetOk.ok) return { error: targetOk.error };

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      error:
        "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to the deployment environment to enable email updates.",
    };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: newEmailRaw,
    email_confirm: true,
  });
  if (error) {
    logServerError("admin/email/updateUserById", error);
    return { error: error.message || "Could not update email." };
  }

  return {
    success: true,
    message:
      "Login email updated and marked confirmed. The user must sign in with the new address (password unchanged unless you reset it).",
    newEmail: newEmailRaw,
  };
}

/** Staff-only: set a new password on a talent or client auth user (requires service role key). */
export async function adminResetTalentClientPassword(
  _prev: AdminPasswordResetState,
  formData: FormData,
): Promise<AdminPasswordResetState> {
  const staff = await requireStaff();
  if (!staff.ok) return { error: staff.error };

  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId) return { error: "Missing user." };

  const mode = String(formData.get("mode") ?? "generate").trim();
  const custom = String(formData.get("new_password") ?? "");

  const targetOk = await assertTalentOrClientUserId(staff.supabase, userId);
  if (!targetOk.ok) return { error: targetOk.error };

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      error:
        "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to the deployment environment to enable password reset.",
    };
  }

  let password: string;
  let temporaryPassword: string | undefined;

  if (mode === "custom") {
    const p = custom.trim();
    if (p.length < 8) {
      return { error: "Custom password must be at least 8 characters." };
    }
    password = p;
  } else {
    password = generateTemporaryPassword();
    temporaryPassword = password;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    logServerError("admin/password/updateUserById", error);
    return { error: error.message || "Could not update password." };
  }

  if (temporaryPassword) {
    return {
      success: true,
      temporaryPassword,
      message:
        "A new password was set. Copy it below and share it securely with the user. It will not be shown again.",
    };
  }
  return { success: true, message: "Password updated." };
}
