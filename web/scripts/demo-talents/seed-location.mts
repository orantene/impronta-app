/**
 * Seed ONLY the Location settings (talent_location_settings) of the demo
 * talents that define `location` (Alba today). A one-row, idempotent upsert:
 * unlike seed.mts it does not touch offerings, photos, reviews or the site.
 *
 * Safety: the target project is named explicitly, only TAL-93xxx profile codes
 * are touched, and demos are written in "zone only" mode with NO exact address
 * (nothing private exists to leak). Add --dry-run to print what would change.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=<env> scripts/demo-talents/seed-location.mts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";

import { DEMOS } from "./demos";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const dryRun = process.argv.includes("--dry-run");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const d of DEMOS) {
  if (!d.location) continue;
  if (!/^TAL-93\d{3}$/.test(d.profileCode)) throw new Error(`REFUSE: ${d.profileCode} is not a demo code`);
  const { data: profile, error } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("profile_code", d.profileCode)
    .maybeSingle();
  if (error) throw error;
  if (!profile) {
    console.warn(`  ${d.profileCode} (${d.displayName}): not seeded on this project, skipped`);
    continue;
  }
  const row = {
    talent_profile_id: profile.id as string,
    address_mode: d.location.addressMode,
    studio_kind: d.location.studioKind,
    zone_neighbourhood: d.location.neighbourhood,
    arrival_note: d.location.arrivalNote,
    arrival_photo_url: null,
    exact_address: null,
    updated_at: new Date().toISOString(),
  };
  if (dryRun) {
    console.log(`  [dry-run] ${d.profileCode}`, { ...row, talent_profile_id: "(id)" });
    continue;
  }
  const { error: upErr } = await admin.from("talent_location_settings").upsert(row, { onConflict: "talent_profile_id" });
  if (upErr) throw upErr;
  console.log(`  ${d.profileCode} (${d.displayName}): location settings written (${d.location.addressMode}, ${d.location.neighbourhood})`);
}
console.log("done");
