// SUPERSEDED by `npm run demos:rebuild` (scripts/demo-talents/rebuild.mjs): one command, backup + restore, dry run by default.
console.error("[demo-talents] superseded: use `npm run demos:rebuild` (dry run by default, --write to apply).");
/**
 * Seed ONLY the Location settings (talent_location_settings) of the demo
 * talents that define `location` (Alba today). A one-row, idempotent upsert:
 * unlike seed.mts it does not touch offerings, photos, reviews or the site.
 *
 * Safety: the target project is named explicitly, and a row is written ONLY
 * when `talent_profiles.is_demo = true`. The TAL-93xxx code check is an extra
 * filter, never the guard: QA users (TAL-93900, TAL-93901) share that range and
 * are NOT demos. Demos are written in "zone only" mode with NO exact address
 * (nothing private exists to leak). Add --dry-run to print what would change.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=<env> scripts/demo-talents/seed-location.mts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";

import { DEMOS } from "./demos";
import { applyDemoLocation } from "../../src/lib/talent-site/demos/location";

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
  // The shared writer refuses anything that is not is_demo = true (never the code range alone).
  const res = await applyDemoLocation(admin, { profileCode: d.profileCode, location: d.location, write: !dryRun });
  console.log(`  ${dryRun ? "[dry-run] " : ""}${d.profileCode} (${d.displayName}): ${res}`);
}
console.log("done");
