import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessProfile } from "@/lib/auth-flow";
import { logServerError } from "@/lib/server/safe-error";

export type AccessProfileWithDisplayName = AccessProfile & {
  display_name?: string | null;
  avatar_url?: string | null;
};

const ACCESS_PROFILE_SELECT =
  "account_status, app_role, onboarding_completed_at, display_name, avatar_url";

/** PostgREST: RPC not exposed or DB migration not applied (PGRST202). Fallback path handles it. */
function isRpcMissingFromSchemaCache(err: {
  code?: string;
  message?: string;
}): boolean {
  if (err.code === "PGRST202") return true;
  return (
    typeof err.message === "string" &&
    err.message.includes("Could not find the function")
  );
}

export async function loadAccessProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccessProfileWithDisplayName | null> {
  try {
    const ensured = await supabase.rpc("ensure_profile_for_current_user");
    if (
      ensured.error &&
      !isRpcMissingFromSchemaCache(ensured.error)
    ) {
      logServerError("auth/loadAccessProfile.rpc", ensured.error);
    }
    if (ensured.data) {
      return ensured.data;
    }
  } catch (error) {
    logServerError("auth/loadAccessProfile.rpc", error);
  }

  try {
    const fallback = await supabase
      .from("profiles")
      .select(ACCESS_PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();

    if (fallback.error) {
      logServerError("auth/loadAccessProfile.fallback", fallback.error);
      return null;
    }

    return fallback.data ?? null;
  } catch (error) {
    logServerError("auth/loadAccessProfile.fallback", error);
    return null;
  }
}
