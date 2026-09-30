/**
 * The exact address for the appointment-confirmation message.
 *
 * The talent's address setting decides: ONLY "exact after booking" releases the
 * private address, and only here, in the message the booked client receives
 * after the talent confirmed. Zone only never releases it; public does not need
 * to (it is already on the site). Fails closed: any miss returns null and the
 * confirmation stays the short one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { parseLocationSettings, type LocationSettings } from "@/lib/talent/location-settings";

/** Pure: what the confirmation may carry for these settings. */
export function addressForConfirmation(settings: LocationSettings | null | undefined): string | null {
  if (!settings || settings.addressMode !== "after_booking") return null;
  return settings.exactAddress.trim() || null;
}

/**
 * The address for the single talent of a confirmed appointment. More than one
 * talent (or none) means there is no single place to name, so nothing is sent.
 */
export async function loadConfirmationAddress(
  admin: SupabaseClient,
  talentProfileIds: ReadonlyArray<string | null | undefined>,
): Promise<string | null> {
  const ids = [...new Set(talentProfileIds.filter((id): id is string => Boolean(id)))];
  if (ids.length !== 1) return null;
  try {
    const { data, error } = await admin
      .from("talent_location_settings")
      .select("address_mode, studio_kind, zone_neighbourhood, arrival_note, arrival_photo_url, exact_address")
      .eq("talent_profile_id", ids[0]!)
      .maybeSingle();
    if (error) {
      logServerError("messaging.confirmationAddress", error);
      return null;
    }
    return data ? addressForConfirmation(parseLocationSettings(data)) : null;
  } catch (err) {
    logServerError("messaging.confirmationAddress", err);
    return null;
  }
}
