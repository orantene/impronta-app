import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * A fresh profile (`app_role = 'client'`, still onboarding) becomes a talent.
 * The same promotion the OAuth callback does for a talent-onboarding `next`
 * (`app/auth/callback/route.ts`): email signups carry `signup_intent` in
 * metadata and the DB trigger sets the role; code-only and OAuth signups
 * cannot, so the surface that knows the intent promotes explicitly. Profiles
 * are per user, not per tenant, hence the service role and no tenant scope.
 */
export async function promoteFreshProfileToTalent(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  const { error } = await admin
    .from("profiles")
    .update({ app_role: "talent" })
    .eq("id", userId)
    .eq("app_role", "client")
    .eq("account_status", "onboarding");
  if (error) logServerError("auth/promoteFreshProfileToTalent", error);
}

/**
 * A fresh profile that just became the owner of a workspace becomes staff.
 * `ensure_profile_for_current_user` recomputes `account_status` on every
 * request from the role: a `client` with no client profile is put back to
 * `onboarding` and bounced to the role chooser, whatever the provisioner
 * wrote. Owners created through the account-first paths (`/register?intent=
 * workspace`) arrive as staff already; code-only and OAuth signups arrive as
 * `client`, so the surface that provisions promotes explicitly.
 */
export async function promoteFreshProfileToWorkspaceOwner(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  const { error } = await admin
    .from("profiles")
    .update({ app_role: "agency_staff" })
    .eq("id", userId)
    .eq("app_role", "client")
    .eq("account_status", "onboarding");
  if (error) logServerError("auth/promoteFreshProfileToWorkspaceOwner", error);
}
