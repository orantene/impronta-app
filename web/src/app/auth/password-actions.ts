"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hostSafeRedirectDestination } from "@/lib/saas/host-safe-destination";
import { resolveAuthenticatedDestination } from "@/lib/auth-flow";
import { loadAccessProfile } from "@/lib/access-profile";
import { logServerError } from "@/lib/server/safe-error";
import { requireSession } from "@/lib/server/action-guards";
import { createTranslator } from "@/i18n/messages";

export type PasswordRecoveryActionState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

const MIN_LEN = 8;

/** After clicking the reset link, user has a session; set the new password and send them to their dashboard. */
export async function completeRecoveryPasswordUpdate(
  _prev: PasswordRecoveryActionState,
  formData: FormData,
): Promise<PasswordRecoveryActionState> {
  const locale = String(formData.get("locale") ?? "en");
  const t = createTranslator(locale === "es" ? "es" : "en");
  const session = await requireSession();
  if (!session.ok) return { error: session.error };

  const new_password = String(formData.get("new_password") ?? "");
  const confirm_password = String(formData.get("confirm_password") ?? "");

  if (!new_password || !confirm_password) {
    return { error: t("public.auth.actions.confirmPassword") };
  }
  if (new_password.length < MIN_LEN) {
    return { error: t("public.auth.actions.passwordTooShort") };
  }
  if (new_password !== confirm_password) {
    return { error: t("public.auth.actions.passwordMismatch") };
  }

  const { error } = await session.supabase.auth.updateUser({
    password: new_password,
  });
  if (error) {
    logServerError("auth/password/completeRecovery", error);
    return { error: t("public.auth.actions.generic") };
  }

  const profile = await loadAccessProfile(session.supabase, session.user.id);
  const destination = resolveAuthenticatedDestination(profile);

  revalidatePath("/", "layout");
  // Host-safe: /update-password is reachable on the marketing apex, but the
  // dashboard destination it resolves to is not (see host-safe-destination).
  redirect(await hostSafeRedirectDestination(destination));
}
