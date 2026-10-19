/**
 * TUL-861: the profile's "Available N of the next 30 days" badge reads a precomputed matview
 * (talent_discover_index), while the booking sheet reads the live slot loader. When the two
 * disagree a guest sees "Available 30 of 30" and then "No times available". The badge must not
 * promise what the sheet will refuse, so it asks the SAME live loader the sheet uses and is
 * hidden when every public bookable service comes back empty.
 *
 * No migration: this only reads. Fails open: any error, an unknown answer, or no bookable
 * service keeps the matview value, so a hiccup never blanks a real badge.
 */
import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { loadPublicOpenTimes } from "@/lib/scheduling/public-open-times";
import { liveSlotsAllEmpty, type ProfileAvailability } from "@/lib/scheduling/profile-live-availability-core";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const WINDOW_DAYS = 30;
const MAX_SERVICES_CHECKED = 4;

export async function withLiveAvailability(
  base: ProfileAvailability,
  talentProfileId: string,
): Promise<ProfileAvailability> {
  // Nothing to contradict: the badge already says no availability.
  if (!base.availableDaysInNext30 || base.availableDaysInNext30 <= 0) return base;
  const admin = createServiceRoleClient();
  if (!admin) return base;
  try {
    const { data: offerings, error } = await admin
      .from("talent_offerings")
      .select("id")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "published")
      .eq("moderation_state", "approved") // D-10
      .eq("visibility", "public")
      .neq("kind", "product")
      .limit(MAX_SERVICES_CHECKED);
    if (error) {
      logServerError("profile.liveAvailability.offerings", error);
      return base;
    }
    const ids = (offerings ?? []).map((o) => (o as { id: string }).id);
    if (ids.length === 0) return base;
    const now = new Date();
    const results = await Promise.all(
      ids.map((offeringId) =>
        loadPublicOpenTimes(admin, {
          host: { kind: "app", tenantId: null, talentSiteId: null },
          offeringId,
          from: now,
          days: WINDOW_DAYS,
          parseDuration: (offeringMinutes) => offeringMinutes,
          now,
        }),
      ),
    );
    return liveSlotsAllEmpty(results)
      ? { nextAvailableDate: null, availableDaysInNext30: null, availabilityDots14d: null }
      : base;
  } catch (err) {
    logServerError("profile.liveAvailability", err);
    return base;
  }
}
