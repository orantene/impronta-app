/**
 * TUL-1791: `talent_profiles.invitation_email` (a person's contact email) is not
 * column-granted to `authenticated` (held migration 20261231426400). A user-session
 * client can no longer select it or filter on it. The owner and roster staff read it
 * through the SECURITY DEFINER RPC `talent_invitation_email(p_talent_id)`, which
 * returns a value only for the owner (user_id = auth.uid()) or staff who pass
 * `staff_can_access_talent_profile`; and the owner fills an EMPTY value through
 * `talent_seed_invitation_email`. Writes (UPDATE ... SET invitation_email) need no
 * SELECT and are unchanged. Service-role code keeps selecting the column directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type RpcCaller = Pick<SupabaseClient, "rpc">;

/** The contact email, or null when empty OR when the caller may not see it. */
export async function loadTalentInvitationEmail(
  supabase: RpcCaller,
  talentProfileId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("talent_invitation_email", { p_talent_id: talentProfileId });
  if (error || typeof data !== "string") return null;
  return data;
}

/** Owner-only: fills an empty invitation_email. Returns true when it wrote. */
export async function seedTalentInvitationEmail(
  supabase: RpcCaller,
  talentProfileId: string,
  email: string,
): Promise<{ ok: boolean; error: unknown | null }> {
  const { data, error } = await supabase.rpc("talent_seed_invitation_email", {
    p_talent_id: talentProfileId,
    p_email: email,
  });
  return { ok: !error && data === true, error: error ?? null };
}
