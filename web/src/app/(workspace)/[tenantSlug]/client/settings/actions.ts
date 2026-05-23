"use server";

// Client self-edit server actions. Mirrors the admin pattern in
// `lib/server-actions/admin-clients.ts` but uses `requireSession()` so
// the user can only update their own row — RLS policy
// `client_profiles_write_own` (user_id = auth.uid()) enforces it
// server-side regardless.
//
// Display name lives on `profiles.display_name` (not `client_profiles`);
// company lives on `client_profiles.company_name`. We update both in a
// single action.
//
// Email and password updates use the standard Supabase session
// (`auth.updateUser(...)`). updateUser({email}) triggers a two-sided
// verification email; the actual change lands once the new address is
// confirmed.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type ClientProfileResult =
  | { ok: true }
  | { ok: false; error: string };

const profileSchema = z.object({
  tenantSlug: z.string().min(1),
  displayName: z.string().trim().min(1, "Name can't be empty.").max(120),
  company: z.string().trim().max(120),
});

export async function updateClientSelfProfile(
  input: { tenantSlug: string; displayName: string; company: string },
): Promise<ClientProfileResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { tenantSlug, displayName, company } = parsed.data;
  const { supabase, user } = auth;
  const now = new Date().toISOString();

  // 1. Update display_name on profiles (the global identity row).
  const nameUpdate = await supabase
    .from("profiles")
    .update({ display_name: displayName, updated_at: now })
    .eq("id", user.id);
  if (nameUpdate.error) {
    logServerError("client/updateClientSelfProfile.profiles", nameUpdate.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // 2. Update company_name on the client_profiles row keyed by user_id.
  const companyUpdate = await supabase
    .from("client_profiles")
    .update({ company_name: company || null, updated_at: now })
    .eq("user_id", user.id);
  if (companyUpdate.error) {
    logServerError("client/updateClientSelfProfile.client_profiles", companyUpdate.error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${tenantSlug}/client/settings`);
  revalidatePath(`/${tenantSlug}/client`, "layout");
  return { ok: true };
}

const emailSchema = z.object({
  newEmail: z.string().email("Enter a valid email."),
});

export async function updateClientSelfEmail(
  input: { newEmail: string },
): Promise<ClientProfileResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email." };
  }
  const newEmail = parsed.data.newEmail.toLowerCase().trim();
  if (newEmail === auth.user.email?.toLowerCase()) {
    return { ok: false, error: "That's already your current email." };
  }

  const { error } = await auth.supabase.auth.updateUser({ email: newEmail });
  if (error) {
    logServerError("client/updateClientSelfEmail", error);
    return { ok: false, error: error.message || CLIENT_ERROR.update };
  }
  return { ok: true };
}

const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export async function updateClientSelfPassword(
  input: { newPassword: string; confirmPassword: string },
): Promise<ClientProfileResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { error } = await auth.supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) {
    logServerError("client/updateClientSelfPassword", error);
    return { ok: false, error: error.message || CLIENT_ERROR.update };
  }
  return { ok: true };
}
