/**
 * Location settings (talent_location_settings) of a demo that defines one.
 * Moved here from scripts/demo-talents/seed-location.mts so the CLI and the
 * rebuild share one writer. Demos are "zone only": a neighbourhood and an
 * arrival note, NEVER an exact address (nothing private exists to leak).
 *
 * The writer refuses anything that is not `talent_profiles.is_demo = true`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DemoLocation {
  addressMode: "zone_only" | "after_booking" | "public";
  studioKind: "studio" | "home_visits" | "both";
  neighbourhood: string;
  arrivalNote: string;
}

/** Alba's Location section (Maison v2 proposal). */
export const ALBA_LOCATION: DemoLocation = {
  addressMode: "zone_only",
  studioKind: "studio",
  neighbourhood: "García Ginerés",
  arrivalNote: "Estudio privado, solo con cita. Hay lugar para estacionarte en la calle.",
};

/** Demos with a location of their own, by profile code. */
export const DEMO_LOCATIONS: Readonly<Record<string, DemoLocation>> = { "TAL-93020": ALBA_LOCATION };

type Db = Pick<SupabaseClient, "from">;

export interface LocationRow {
  talent_profile_id: string;
  address_mode: string;
  studio_kind: string;
  zone_neighbourhood: string;
  arrival_note: string;
  arrival_photo_url: null;
  exact_address: null;
}

export function locationRow(talentProfileId: string, loc: DemoLocation): LocationRow {
  return {
    talent_profile_id: talentProfileId,
    address_mode: loc.addressMode,
    studio_kind: loc.studioKind,
    zone_neighbourhood: loc.neighbourhood,
    arrival_note: loc.arrivalNote,
    arrival_photo_url: null,
    exact_address: null,
  };
}

export type LocationResult = "unchanged" | "would_write" | "wrote" | "not_found";

/** Upsert one demo's Location settings. Idempotent: an identical row is "unchanged" and not touched. */
export async function applyDemoLocation(
  admin: Db,
  input: { profileCode: string; location: DemoLocation; write: boolean },
): Promise<LocationResult> {
  const { data: profile, error } = await admin
    .from("talent_profiles")
    .select("id, is_demo")
    .eq("profile_code", input.profileCode)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return "not_found";
  const p = profile as { id: string; is_demo?: boolean | null };
  if (p.is_demo !== true) throw new Error(`REFUSE: ${input.profileCode} is not a demo profile`);
  const row = locationRow(p.id, input.location);
  const { data: have, error: haveErr } = await admin
    .from("talent_location_settings")
    .select("address_mode, studio_kind, zone_neighbourhood, arrival_note, arrival_photo_url, exact_address")
    .eq("talent_profile_id", p.id)
    .maybeSingle();
  if (haveErr) throw haveErr;
  const h = have as Partial<LocationRow> | null;
  if (
    h &&
    h.address_mode === row.address_mode &&
    h.studio_kind === row.studio_kind &&
    h.zone_neighbourhood === row.zone_neighbourhood &&
    h.arrival_note === row.arrival_note &&
    (h.arrival_photo_url ?? null) === null &&
    (h.exact_address ?? null) === null
  ) {
    return "unchanged";
  }
  if (!input.write) return "would_write";
  const { error: upErr } = await admin
    .from("talent_location_settings")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "talent_profile_id" });
  if (upErr) throw upErr;
  return "wrote";
}
