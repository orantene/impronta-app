"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveAuthenticatedDestination } from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { requireSession } from "@/lib/server/action-guards";

export type PasswordRecoveryActionState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

const MIN_LEN = 8;

/** After clicking the reset link, user has a session; set the new password and send them to their dashboard. */
export async function completeRecoveryPasswordUpdate(
  _prev: PasswordRecoveryActionState,
  formData: FormData,
): Promise<PasswordRecoveryActionState> {
  const session = await requireSession();
  if (!session.ok) return { error: session.error };

  const new_password = String(formData.get("new_password") ?? "");
  const confirm_password = String(formData.get("confirm_password") ?? "");

  if (!new_password || !confirm_password) {
    return { error: "Enter and confirm your new password." };
  }
  if (new_password.length < MIN_LEN) {
    return { error: `Password must be at least ${MIN_LEN} characters.` };
  }
  if (new_password !== confirm_password) {
    return { error: "Password and confirmation do not match." };
  }

  const { error } = await session.supabase.auth.updateUser({
    password: new_password,
  });
  if (error) {
    logServerError("auth/password/completeRecovery", error);
    return { error: CLIENT_ERROR.generic };
  }

  const profile = await loadAccessProfile(session.supabase, session.user.id);
  const destination = resolveAuthenticatedDestination(profile);

  revalidatePath("/", "layout");
  redirect(destination);
}
