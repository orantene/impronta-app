import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * The client the talent's own Money page reads her earnings with.
 *
 * Why: the earnings read starts at `booking_talent` joined to `agency_bookings`, and neither table has a talent
 * self-read policy (only client, coordinator and tenant-staff policies). A talent who is NOT a coordinator of a sale
 * (a client-initiated hub inquiry where she is only the seller) therefore saw her own paid sale as nothing: Cobrado
 * $0, Pagos 0 (paid run 2026-10-09). Same pattern as the agenda: prove the profile is hers under HER OWN rights, then
 * read with the service role, scoped to that profile id only.
 *
 * Falls back to the user's client on every doubt (no session, another user's profile, a failed read, no service
 * role), which is exactly the old behaviour.
 */
export async function earningsClientForOwnProfile(
  userClient: SupabaseClient,
  talentProfileId: string,
  deps?: { serviceClient?: SupabaseClient | null },
): Promise<SupabaseClient> {
  try {
    const { data: auth } = await userClient.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return userClient;
    const { data, error } = await userClient.from("talent_profiles").select("user_id").eq("id", talentProfileId).maybeSingle();
    if (error) {
      logServerError("own-earnings-client.profile", error);
      return userClient;
    }
    if ((data as { user_id?: string | null } | null)?.user_id !== uid) return userClient;
    return (deps?.serviceClient !== undefined ? deps.serviceClient : createServiceRoleClient()) ?? userClient;
  } catch (err) {
    logServerError("own-earnings-client", err);
    return userClient;
  }
}
