import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export type NewClientInput = {
  display_name: string;
  email: string;
  company_name: string;
  phone: string;
  whatsapp_phone: string;
  website_url: string;
  notes: string;
};

export type CreateClientAccountResult =
  | { ok: true; userId: string }
  | { ok: false; step: "invite" | "exists" | "profile" | "client_profile" | "attach"; message?: string };

/**
 * `inviteUserByEmail` refuses a CONFIRMED user but not an UNCONFIRMED one: it re-sends the invite and
 * returns that existing user. Only a user created by THIS call may be written to or rolled back, so the
 * returned user counts as new only if its `created_at` is not older than the moment we started (the small
 * tolerance covers clock skew between this server and the database).
 */
export const NEW_USER_SKEW_MS = 10_000;

/**
 * TUL-1733 follow-ups: create a client login for a workspace.
 *
 * - The client is INVITED by email (Supabase `inviteUserByEmail`) and chooses their own password, so no
 *   password is ever typed, shown or shared by staff.
 * - Every step after the invite can fail; when one does, the auth user just created is DELETED so no
 *   orphan login is left and the same email can be retried. (An invite that itself fails created nothing.)
 * - An email that already has an (unconfirmed) account is REFUSED before any write, and that account is
 *   never touched or deleted: we only ever roll back a user this call created.
 * - Attaching the client to the workspace is passed in (`attachToTenant`) so the workspace id never
 *   arrives as a caller-supplied argument here.
 */
export async function createClientAccount(
  deps: { admin: SupabaseClient; attachToTenant: (userId: string) => Promise<boolean>; redirectTo?: string },
  input: NewClientInput,
): Promise<CreateClientAccountResult> {
  const { admin } = deps;
  const startedAt = Date.now();
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { display_name: input.display_name },
    ...(deps.redirectTo ? { redirectTo: deps.redirectTo } : {}),
  });
  const userId = invited?.user?.id;
  if (inviteErr || !userId) {
    logServerError("admin/createClientAccount/invite", inviteErr);
    return { ok: false, step: "invite", message: inviteErr?.message };
  }

  const createdAt = Date.parse(String(invited?.user?.created_at ?? ""));
  if (!Number.isFinite(createdAt) || createdAt < startedAt - NEW_USER_SKEW_MS) {
    // An existing, unconfirmed account was re-invited. Do not promote it, write to it, or delete it.
    logServerError("admin/createClientAccount/exists", "invite returned a user that already existed");
    return { ok: false, step: "exists", message: "That email already has an account." };
  }

  const rollback = async (step: "profile" | "client_profile" | "attach", detail: unknown): Promise<CreateClientAccountResult> => {
    logServerError(`admin/createClientAccount/${step}`, detail);
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) logServerError("admin/createClientAccount/rollbackDelete", delErr);
    return { ok: false, step };
  };

  // The brand-new user is tied to no workspace yet, and role / status changes are platform-admin-only for
  // direct sessions (profiles_protect_role_status), so these writes use the service role.
  const now = new Date().toISOString();
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ display_name: input.display_name, app_role: "client", account_status: "active", onboarding_completed_at: now, updated_at: now })
    .eq("id", userId);
  if (profileErr) return rollback("profile", profileErr);

  const { error: clientProfileErr } = await admin.from("client_profiles").upsert(
    {
      user_id: userId,
      company_name: input.company_name || null,
      phone: input.phone || null,
      whatsapp_phone: input.whatsapp_phone || null,
      website_url: input.website_url || null,
      notes: input.notes || null,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (clientProfileErr) return rollback("client_profile", clientProfileErr);

  let attached = false;
  try {
    attached = await deps.attachToTenant(userId);
  } catch (err) {
    return rollback("attach", err);
  }
  if (!attached) return rollback("attach", "could not attach the new client to the workspace");

  return { ok: true, userId };
}
