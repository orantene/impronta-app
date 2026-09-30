"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  DEFAULT_LOCATION_SETTINGS,
  parseLocationSettings,
  toLocationRow,
  type LocationSettings,
} from "@/lib/talent/location-settings";

async function requireOwner(talentProfileId: string) {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "Server configuration error." };
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talent.locationSettings.requireOwner", error);
    return { ok: false as const, error: "Could not verify ownership." };
  }
  if (!data || data.user_id !== session.user.id) return { ok: false as const, error: "Forbidden." };
  return { ok: true as const, admin };
}

/** Owner-only read. This is the one read that includes the private address. */
export async function loadLocationSettings(
  talentProfileId: string,
): Promise<{ ok: true; settings: LocationSettings } | { ok: false; error: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.admin
    .from("talent_location_settings")
    .select("address_mode, studio_kind, zone_neighbourhood, arrival_note, arrival_photo_url, exact_address")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talent.locationSettings.load", error);
    return { ok: false, error: "Could not load location settings." };
  }
  return { ok: true, settings: data ? parseLocationSettings(data) : { ...DEFAULT_LOCATION_SETTINGS } };
}

export async function saveLocationSettings(
  talentProfileId: string,
  input: LocationSettings,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const settings = parseLocationSettings(input);
  if (settings.addressMode === "public" && !settings.exactAddress) {
    return { ok: false, error: "Add your exact address to show it publicly." };
  }
  const { error } = await auth.admin.from("talent_location_settings").upsert(
    {
      talent_profile_id: talentProfileId,
      ...toLocationRow(settings),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_profile_id" },
  );
  if (error) {
    logServerError("talent.locationSettings.save", error);
    return { ok: false, error: "Could not save location settings." };
  }
  revalidatePath("/talent/services");
  return { ok: true };
}
