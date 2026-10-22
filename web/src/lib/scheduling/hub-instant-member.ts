/**
 * TUL-1471b: is this talent's offering sold by an INSTANT hub entry of the channel workspace?
 *
 * An owner who builds an instant entry and accepts a talent's listing into it has chosen to sell
 * that service online. Without this, a workspace that never switched the separate "appointments"
 * master switch on (`agencies.settings.appointments.enabled`) listed the entry with a Book button
 * and then refused the booking everywhere (the /book widget, the slots route, checkout) because
 * the policy resolver read "workspace appointments off" as inquiry-only.
 *
 * It lifts ONLY the workspace master switch for that one offering. Everything else still gates:
 * the talent's own opt-in, the roster row's direct booking and site visibility, exclusivity, the
 * plan ceiling, the offering's own sellable check and her working hours. Tenant-scoped on every
 * read; any unreadable part answers false (the old, stricter behaviour).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export async function isInstantHubMember(
  admin: SupabaseClient,
  input: { tenantId: string; talentProfileId: string; offeringId: string },
): Promise<boolean> {
  try {
    const { data: listings, error } = await admin
      .from("workspace_service_listings")
      .select("entry_id, owner_skipped_at")
      .eq("tenant_id", input.tenantId)
      .eq("talent_profile_id", input.talentProfileId)
      .eq("offering_id", input.offeringId)
      .eq("status", "accepted")
      .not("entry_id", "is", null);
    if (error) {
      // Tables not applied yet (42P01 / PGRST205 / 42703) is "no entries", not an incident.
      if (error.code !== "42P01" && error.code !== "PGRST205" && error.code !== "42703") logServerError("booking.hubInstantMember.listings", error);
      return false;
    }
    const entryIds = [
      ...new Set(
        ((listings ?? []) as Array<{ entry_id: string | null; owner_skipped_at: string | null }>)
          .filter((l) => !l.owner_skipped_at && typeof l.entry_id === "string")
          .map((l) => l.entry_id as string),
      ),
    ];
    if (entryIds.length === 0) return false;
    const { data: entries, error: eErr } = await admin
      .from("workspace_service_entries")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .in("id", entryIds)
      .eq("hidden", false)
      .eq("booking_type", "instant")
      .limit(1);
    if (eErr) {
      logServerError("booking.hubInstantMember.entries", eErr);
      return false;
    }
    return (entries ?? []).length > 0;
  } catch (err) {
    logServerError("booking.hubInstantMember", err);
    return false;
  }
}
