import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import { afterResponse } from "@/lib/server/after-response";

/**
 * TUL-1929: after a workspace offers or edits a listing, tell the talent when it is now waiting
 * for her answer (status 'offered', which the database sets on a new listing and on any change to
 * booking type, price, who is shown or client contact). Fire-and-forget, never throws, silent while
 * the listing tables are not applied. eventId = listing + its updated_at, so a retry is deduped and
 * a later edit rings again. Returns whether a bell was queued.
 */
export async function notifyListingOffered(params: { admin?: SupabaseClient; listingId: string }): Promise<boolean> {
  const { listingId } = params;
  try {
    const admin = params.admin ?? createServiceRoleClient();
    if (!admin) return false;
    const { data, error } = await admin
      .from("workspace_service_listings")
      .select("id, tenant_id, talent_profile_id, offering_id, status, updated_at")
      .eq("id", listingId)
      .maybeSingle();
    if (error) {
      const code = (error as { code?: string }).code;
      if (code !== "42P01" && code !== "PGRST205" && code !== "42703") logServerError("notifyListingOffered.read", error);
      return false;
    }
    const l = data as { tenant_id?: string; talent_profile_id?: string; offering_id?: string; status?: string; updated_at?: string } | null;
    if (!l || l.status !== "offered" || !l.tenant_id || !l.talent_profile_id) return false;

    const [talent, agency, offering] = await Promise.all([
      admin.from("talent_profiles").select("user_id").eq("id", l.talent_profile_id).maybeSingle(),
      admin.from("agencies").select("display_name").eq("id", l.tenant_id).maybeSingle(),
      l.offering_id ? admin.from("talent_offerings").select("title").eq("id", l.offering_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const userId = (talent.data as { user_id?: string | null } | null)?.user_id ?? null;
    if (!userId) return false;
    const workspaceName = (agency.data as { display_name?: string | null } | null)?.display_name ?? null;
    const serviceTitle = (offering.data as { title?: string | null } | null)?.title ?? null;
    afterResponse(() =>
      dispatchEventNotifications({
        type: "hub.listing_update_offered",
        tenantId: l.tenant_id!,
        eventId: `hub-listing-offered:${listingId}:${l.updated_at ?? ""}`,
        userId,
        payload: { workspaceName, serviceTitle, url: `${getAppUrl()}/talent/where-you-appear` },
      }).catch((err) => logServerError("notifyListingOffered.dispatch", err)),
    );
    return true;
  } catch (err) {
    logServerError("notifyListingOffered", err);
    return false;
  }
}
