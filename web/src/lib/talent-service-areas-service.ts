/**
 * Domain logic for talent_service_areas.
 *
 * talent_service_areas is the canonical structured location record.
 * - service_kind='home_base': max 1 per profile (DB partial unique index).
 *   Mirrors talent_profiles.location_id (back-compat field).
 * - service_kind='travel_to': additional cities the talent works in.
 * - service_kind='remote_only': virtual-only services.
 *
 * talent_profiles.destinations TEXT[] is a derived cache refreshed by a DB
 * trigger. App code should NOT write to that array directly after PR 1.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export type ServiceKind = "home_base" | "travel_to" | "remote_only";

export type TalentServiceAreaInput = {
  locationId: string;
  serviceKind: ServiceKind;
  travelRadiusKm?: number | null;
  travelFeeRequired?: boolean;
  notes?: string | null;
  displayOrder?: number;
};

export type ServiceAreaMutationResult = { ok: true } | { ok: false; error: string };

/**
 * Replace the full set of service-area rows for a profile.
 *
 * Caller is responsible for ensuring at most one home_base row in the input.
 * The DB will reject a second home_base via the partial unique index.
 */
export async function setTalentServiceAreas(
  supabase: SupabaseClient,
  params: {
    talentProfileId: string;
    tenantId: string | null;
    rows: TalentServiceAreaInput[];
  },
): Promise<ServiceAreaMutationResult> {
  const homeBaseCount = params.rows.filter((r) => r.serviceKind === "home_base").length;
  if (homeBaseCount > 1) {
    return { ok: false, error: "Only one home_base service area is allowed per profile." };
  }

  if (params.rows.length > 0) {
    const upsertRows = params.rows.map((r, i) => ({
      tenant_id: params.tenantId,
      talent_profile_id: params.talentProfileId,
      location_id: r.locationId,
      service_kind: r.serviceKind,
      travel_radius_km: r.travelRadiusKm ?? null,
      travel_fee_required: r.travelFeeRequired ?? false,
      notes: r.notes ?? null,
      display_order: r.displayOrder ?? i,
    }));

    const { error: upErr } = await supabase
      .from("talent_service_areas")
      .upsert(upsertRows, { onConflict: "talent_profile_id,location_id,service_kind" });

    if (upErr) {
      logServerError("talent-service-areas/set/upsert", upErr);
      return { ok: false, error: "Could not save service areas." };
    }
  }

  // Build the set of (location_id, service_kind) pairs we want to keep.
  const keep = new Set(params.rows.map((r) => `${r.locationId}::${r.serviceKind}`));

  const { data: existing, error: listErr } = await supabase
    .from("talent_service_areas")
    .select("id, location_id, service_kind")
    .eq("talent_profile_id", params.talentProfileId);

  if (listErr) {
    logServerError("talent-service-areas/set/list", listErr);
    return { ok: false, error: "Could not save service areas." };
  }

  const idsToDelete = (existing ?? [])
    .filter((row) => !keep.has(`${row.location_id}::${row.service_kind}`))
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("talent_service_areas")
      .delete()
      .in("id", idsToDelete);
    if (delErr) {
      logServerError("talent-service-areas/set/delete", delErr);
      return { ok: false, error: "Could not save service areas." };
    }
  }

  return { ok: true };
}

export async function removeTalentServiceArea(
  supabase: SupabaseClient,
  params: { talentProfileId: string; locationId: string; serviceKind: ServiceKind },
): Promise<ServiceAreaMutationResult> {
  const { error } = await supabase
    .from("talent_service_areas")
    .delete()
    .eq("talent_profile_id", params.talentProfileId)
    .eq("location_id", params.locationId)
    .eq("service_kind", params.serviceKind);

  if (error) {
    logServerError("talent-service-areas/remove", error);
    return { ok: false, error: "Could not remove service area." };
  }
  return { ok: true };
}
