/**
 * Venues — the database half of Spaces & Seating S1.
 *
 * A venue is the physical place a workspace operates from: an address, a
 * timezone, opening hours. Every workspace has exactly one default venue,
 * created by the S1 migration and by the provisioner for new workspaces.
 *
 * The only thing this module is allowed to be used for today is answering
 * "what time is it for this workspace". Rooms, tables and layouts arrive in S2
 * and hang off `venues.id`.
 */

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  PLATFORM_FALLBACK_TIMEZONE,
  pickTimezone,
  type ResolvedTimezone,
} from "./venue-timezone";

export type VenueRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  is_default: boolean;
  status: "active" | "closed";
};

const VENUE_COLUMNS =
  "id, tenant_id, name, slug, address_line1, address_line2, city, region, postal_code, country_code, google_place_id, latitude, longitude, timezone, is_default, status";

/** The workspace's default venue, or null when it somehow has none. */
export async function loadDefaultVenue(tenantId: string): Promise<VenueRow | null> {
  if (!tenantId) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("venues")
    .select(VENUE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) {
    // A failed read must not read as "this workspace has no venue". That is the
    // silent path back to UTC, which is the bug S1a exists to close.
    logServerError("spaces/loadDefaultVenue", error);
    return null;
  }
  return (data as VenueRow | null) ?? null;
}

export async function listVenues(tenantId: string): Promise<VenueRow[]> {
  if (!tenantId) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("venues")
    .select(VENUE_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) {
    // An empty list and a failed read render identically to a caller. Say which.
    logServerError("spaces/listVenues", error);
    return [];
  }
  return (data as VenueRow[] | null) ?? [];
}

/**
 * The timezone for a workspace, optionally at a specific venue.
 *
 * This is the ONLY timezone read path. The appointment policy, the reservation
 * stamp, the reminder crons and the notification catalog all come here. A
 * second read path is a bug, and the reason for that rule is that the four of
 * them each invented their own "UTC" default and nobody could say which one a
 * given email had used.
 *
 * `venueId` selects a venue explicitly; omitting it uses the workspace default.
 * Falls all the way through to "UTC" rather than throwing, because a failure to
 * resolve must degrade a time, never a page.
 */
export async function resolveTenantTimezone(
  tenantId: string,
  venueId?: string | null,
): Promise<ResolvedTimezone> {
  if (!tenantId) return { timezone: PLATFORM_FALLBACK_TIMEZONE, source: "platform" };
  const admin = createServiceRoleClient();
  if (!admin) return { timezone: PLATFORM_FALLBACK_TIMEZONE, source: "platform" };

  const [venueResult, agencyResult] = await Promise.all([
    venueId
      ? admin
          .from("venues")
          .select("timezone")
          .eq("id", venueId)
          .eq("tenant_id", tenantId)
          .maybeSingle()
      : admin
          .from("venues")
          .select("timezone")
          .eq("tenant_id", tenantId)
          .eq("is_default", true)
          .maybeSingle(),
    admin.from("agencies").select("timezone, settings").eq("id", tenantId).maybeSingle(),
  ]);

  const agency = agencyResult.data as
    | { timezone: string | null; settings: unknown }
    | null;

  return pickTimezone({
    venue: (venueResult.data as { timezone: string | null } | null)?.timezone ?? null,
    workspace: agency?.timezone ?? null,
    appointmentsSetting: appointmentsTimezoneFromSettings(agency?.settings),
  });
}

/** Convenience for callers that only want the string. */
export async function tenantTimezone(
  tenantId: string,
  venueId?: string | null,
): Promise<string> {
  return (await resolveTenantTimezone(tenantId, venueId)).timezone;
}

function appointmentsTimezoneFromSettings(settings: unknown): string | null {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    return null;
  }
  const appointments = (settings as Record<string, unknown>).appointments;
  if (
    typeof appointments !== "object" ||
    appointments === null ||
    Array.isArray(appointments)
  ) {
    return null;
  }
  const tz = (appointments as Record<string, unknown>).timezone;
  return typeof tz === "string" ? tz : null;
}
