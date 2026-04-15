import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";

const SELECT =
  "account_status, app_role, onboarding_completed_at, display_name, avatar_url";

/** Staff RLS can read other profiles; no ensure_profile RPC. */
export async function loadProfileRowById(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccessProfileWithDisplayName | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as AccessProfileWithDisplayName;
}
