import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import { afterResponse } from "@/lib/server/after-response";

export type BreachedListing = { id: string; tenantId: string; breachedAt: string };

/** PURE: the listings the database has stamped as breached (floor_breached_at set). Anything else is not a breach. */
export function breachedListings(rows: ReadonlyArray<Record<string, unknown>>): BreachedListing[] {
  const out: BreachedListing[] = [];
  for (const r of rows) {
    const id = typeof r.id === "string" ? r.id : null;
    const tenantId = typeof r.tenant_id === "string" ? r.tenant_id : null;
    const at = typeof r.floor_breached_at === "string" ? r.floor_breached_at : null;
    // A breach that comes from a currency change is not a price raise; a hidden listing is not for sale.
    if (r.currency_changed_at != null || r.status === "hidden") continue;
    if (id && tenantId && at) out.push({ id, tenantId, breachedAt: at });
  }
  return out;
}

/**
 * TUL-1469: after a talent saved their service, tell each workspace whose listing of it now falls
 * below its minimum (bell to Manager+). Fire-and-forget, idempotent (eventId = listing + breach
 * time), never throws, silent while the listing tables are not applied.
 */
export async function notifyListingsBelowMinimum(params: {
  admin: SupabaseClient;
  offeringId: string;
  talentProfileId: string;
  serviceTitle: string | null;
}): Promise<number> {
  const { admin, offeringId, talentProfileId, serviceTitle } = params;
  try {
    const { data, error } = await admin
      .from("workspace_service_listings")
      .select("id, tenant_id, status, currency_changed_at, floor_breached_at")
      .eq("offering_id", offeringId)
      .eq("talent_profile_id", talentProfileId)
      .not("floor_breached_at", "is", null);
    if (error) {
      const code = (error as { code?: string }).code;
      if (code !== "42P01" && code !== "PGRST205" && code !== "42703") logServerError("notifyListingsBelowMinimum.read", error);
      return 0;
    }
    let breached = breachedListings((data ?? []) as Array<Record<string, unknown>>);
    if (breached.length === 0) return 0;
    // Skip workspaces she has left (roster row removed/inactive) or was never live in.
    const { data: roster, error: rErr } = await admin
      .from("agency_talent_roster")
      .select("tenant_id, status")
      .eq("talent_profile_id", talentProfileId)
      .in("tenant_id", breached.map((b) => b.tenantId));
    if (rErr) {
      logServerError("notifyListingsBelowMinimum.roster", rErr);
      return 0;
    }
    const live = new Set(((roster ?? []) as Array<{ tenant_id: string; status: string | null }>).filter((r) => r.status === "active" || r.status === "pending").map((r) => r.tenant_id));
    breached = breached.filter((b) => live.has(b.tenantId));
    if (breached.length === 0) return 0;
    const { data: talent, error: tErr } = await admin.from("talent_profiles").select("display_name").eq("id", talentProfileId).maybeSingle();
    if (tErr) logServerError("notifyListingsBelowMinimum.talent", tErr);
    const talentName = (talent as { display_name?: string | null } | null)?.display_name ?? null;
    for (const b of breached) {
      const { data: agency, error: aErr } = await admin.from("agencies").select("slug").eq("id", b.tenantId).maybeSingle();
      if (aErr) logServerError("notifyListingsBelowMinimum.agency", aErr);
      const slug = (agency as { slug?: string | null } | null)?.slug ?? null;
      const listingsUrl = slug ? `${getAppUrl()}/${encodeURIComponent(slug)}/admin/catalog/service-hub` : getAppUrl();
      afterResponse(() =>
        dispatchEventNotifications({
          type: "hub.listing_below_minimum",
          tenantId: b.tenantId,
          eventId: `hub-below-min:${b.id}:${b.breachedAt}`,
          payload: { talentName, serviceTitle, listingsUrl },
        }).catch((err) => logServerError("notifyListingsBelowMinimum.dispatch", err)),
      );
    }
    return breached.length;
  } catch (err) {
    logServerError("notifyListingsBelowMinimum", err);
    return 0;
  }
}
