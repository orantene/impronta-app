"use server";

// admin-talent-service-areas.ts
//
// Canonical Service-Area write/read for the drawer + full-page editor.
// Single source of truth: talent_service_areas (location_id → locations,
// service_kind ∈ home_base|travel_to|remote_only). Mirrors the proven
// Languages setAll contract: auth/roster once · validate curated
// location_ids · call the canonical domain service (upsert+prune) ·
// mirror the denormalized talent_profiles scalars so nothing goes stale ·
// return the resolved server-truth rows. Types live in the sibling
// .types.ts (a "use server" file may only export async functions).

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  getTalentServiceAreas,
  setTalentServiceAreas,
  type ResolvedServiceArea,
  type TalentServiceAreaInput,
} from "@/lib/talent-service-areas-service";
import type { SaveServiceAreasInput } from "./admin-talent-service-areas.types";

type ReadResult =
  | {
      ok: true;
      rows: ResolvedServiceArea[];
      remote_only: boolean;
      travel_radius_km: number | null;
      travel_fee_required: boolean;
    }
  | { ok: false; error: string };

type WriteResult =
  | { ok: true; rows: ResolvedServiceArea[]; remote_only: boolean }
  | { ok: false; error: string };

export async function getTalentServiceAreasForTalent(input: {
  talent_profile_id: string;
}): Promise<ReadResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: roster } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .neq("status", "removed")
    .maybeSingle();
  if (!roster) return { ok: false, error: "That talent isn't on your roster." };

  const rows = await getTalentServiceAreas(supabase, input.talent_profile_id);
  const { data: prof } = await supabase
    .from("talent_profiles")
    .select("remote_only, travel_radius_km, travel_fee_required")
    .eq("id", input.talent_profile_id)
    .maybeSingle();
  const p = prof as
    | { remote_only?: boolean; travel_radius_km?: number | null; travel_fee_required?: boolean }
    | null;
  return {
    ok: true,
    rows,
    remote_only: !!p?.remote_only,
    travel_radius_km: p?.travel_radius_km ?? null,
    travel_fee_required: !!p?.travel_fee_required,
  };
}

export async function saveTalentServiceAreas(
  input: SaveServiceAreasInput,
): Promise<WriteResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;
  const LOG = "[setServiceAreas]";
  const t0 = Date.now();
  const tpid = input.talent_profile_id;

  const { data: roster, error: rErr } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", tpid)
    .neq("status", "removed")
    .maybeSingle();
  if (rErr) {
    logServerError("admin-service-areas.roster", rErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  if (!roster) return { ok: false, error: "That talent isn't on your roster." };

  // Desired curated location ids (home_base + travel_to), de-duped.
  const homeId = input.home_base_location_id;
  const travelIds = [...new Set(input.travel_to_location_ids)].filter(
    (id) => id && id !== homeId,
  );
  const allIds = [...new Set([...(homeId ? [homeId] : []), ...travelIds])];
  console.info(
    `${LOG} start talent=${tpid} tenant=${tenantId} ` +
      `home_base=${homeId ?? "null"} travel_to=[${travelIds.join(",")}] ` +
      `radius=${input.travel_radius_km ?? "null"} fee=${input.travel_fee_required} remote=${input.remote_only}`,
  );

  // Validate every id is a real, active curated location.
  if (allIds.length > 0) {
    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, display_name_en, active")
      .in("id", allIds);
    if (locErr) {
      logServerError("admin-service-areas.locvalidate", locErr);
      return { ok: false, error: "Couldn't validate the selected locations." };
    }
    const byId = new Map((locs ?? []).map((l) => [l.id, l]));
    const invalid = allIds.filter((id) => {
      const l = byId.get(id);
      return !l || l.active === false;
    });
    if (invalid.length > 0) {
      console.warn(`${LOG} FAIL invalid-locations talent=${tpid} n=${invalid.length}`);
      return {
        ok: false,
        error: "Some selected locations are invalid or inactive.",
      };
    }
    console.info(`${LOG} validated locations ok=${allIds.length}`);
  }

  // Build the canonical desired set. travel_radius_km / travel_fee_required
  // are reflected onto the home_base row (the column exists) so search/AI
  // reading the row get them; remote_only stays a profile scalar in V1.
  const rows: TalentServiceAreaInput[] = [];
  if (homeId) {
    rows.push({
      locationId: homeId,
      serviceKind: "home_base",
      travelRadiusKm: input.travel_radius_km ?? null,
      travelFeeRequired: input.travel_fee_required,
      displayOrder: 0,
    });
  }
  travelIds.forEach((id, i) =>
    rows.push({
      locationId: id,
      serviceKind: "travel_to",
      travelRadiusKm: input.travel_radius_km ?? null,
      travelFeeRequired: input.travel_fee_required,
      displayOrder: i + 1,
    }),
  );

  const res = await setTalentServiceAreas(supabase, {
    talentProfileId: tpid,
    tenantId,
    rows,
  });
  if (!res.ok) {
    console.warn(`${LOG} FAIL setAll talent=${tpid}: ${res.error}`);
    return { ok: false, error: res.error };
  }
  console.info(`${LOG} setAll-ok talent=${tpid} rows=${res.rows.length}`);

  // Mirror the denormalized talent_profiles scalars so the legacy/display
  // columns stay consistent with the canonical rows. Setting location_id
  // fires sync_talent_profile_canonical_locations (residence/country).
  const homeRow = res.rows.find((r) => r.service_kind === "home_base") ?? null;
  const { error: profErr } = await supabase
    .from("talent_profiles")
    .update({
      location_id: homeRow?.location_id ?? null,
      home_city_text: homeRow?.city ?? null,
      travel_radius_km: input.travel_radius_km ?? null,
      travel_fee_required: input.travel_fee_required,
      remote_only: input.remote_only,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tpid);
  if (profErr) {
    logServerError("admin-service-areas.mirror", profErr);
    // Canonical rows are saved; only the scalar mirror failed.
    return {
      ok: false,
      error:
        "Service areas saved, but the profile summary couldn't sync — reopen to confirm.",
    };
  }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  console.info(
    `${LOG} done talent=${tpid} final=${res.rows.length} ` +
      `[${res.rows.map((r) => `${r.service_kind}:${r.city}`).join(",")}] ` +
      `ms=${Date.now() - t0}`,
  );
  return { ok: true, rows: res.rows, remote_only: input.remote_only };
}
