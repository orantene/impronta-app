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

/** A saved row resolved against `locations` — the server-truth shape the
 *  editor reconciles to (same join search-talent / AI / the cache use). */
export type ResolvedServiceArea = {
  id: string;
  location_id: string;
  service_kind: ServiceKind;
  city: string; // locations.display_name_i18n.en (was display_name_en)
  country_code: string | null;
  travel_radius_km: number | null;
  travel_fee_required: boolean;
  display_order: number;
};

export type ServiceAreaMutationResult =
  | { ok: true; rows: ResolvedServiceArea[] }
  | { ok: false; error: string };

/** Read a profile's canonical service areas, resolved against `locations`. */
export async function getTalentServiceAreas(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<ResolvedServiceArea[]> {
  const { data, error } = await supabase
    .from("talent_service_areas")
    .select(
      "id, location_id, service_kind, travel_radius_km, travel_fee_required, display_order, locations ( display_name_i18n, country_code )",
    )
    .eq("talent_profile_id", talentProfileId)
    .not("location_id", "is", null)
    .order("display_order");
  if (error) {
    logServerError("talent-service-areas/get", error);
    return [];
  }
  type Row = {
    id: string;
    location_id: string;
    service_kind: ServiceKind;
    travel_radius_km: number | null;
    travel_fee_required: boolean;
    display_order: number;
    locations:
      | { display_name_i18n: Record<string, string | null> | null; country_code: string | null }
      | { display_name_i18n: Record<string, string | null> | null; country_code: string | null }[]
      | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const loc = Array.isArray(r.locations) ? r.locations[0] : r.locations;
    return {
      id: r.id,
      location_id: r.location_id,
      service_kind: r.service_kind,
      city: loc?.display_name_i18n?.en ?? "",
      country_code: loc?.country_code ?? null,
      travel_radius_km: r.travel_radius_km,
      travel_fee_required: r.travel_fee_required,
      display_order: r.display_order,
    };
  });
}

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

  return { ok: true, rows: await getTalentServiceAreas(supabase, params.talentProfileId) };
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
  return { ok: true, rows: await getTalentServiceAreas(supabase, params.talentProfileId) };
}
