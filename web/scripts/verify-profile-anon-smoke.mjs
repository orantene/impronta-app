/**
 * Anon / public RLS smoke checks (no talent password). Run after migrations.
 * npm run verify:profile-anon-smoke
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const bogusId = "00000000-0000-4000-8000-000000000099";

  const { data: publicProfiles, error: pubErr } = await anon
    .from("talent_profiles")
    .select("id, profile_code, workflow_status, visibility")
    .eq("visibility", "public")
    .eq("workflow_status", "approved")
    .is("deleted_at", null)
    .limit(3);

  if (pubErr) throw pubErr;

  const { data: bogusRows, error: bogusErr } = await anon
    .from("talent_profiles")
    .select("id")
    .eq("id", bogusId)
    .maybeSingle();
  if (bogusErr) throw bogusErr;

  let fieldValuesForPublic = null;
  const sample = publicProfiles?.[0];
  if (sample) {
    const { count, error: fvErr } = await anon
      .from("field_values")
      .select("id", { count: "exact", head: true })
      .eq("talent_profile_id", sample.id);
    if (fvErr) throw fvErr;
    fieldValuesForPublic = { talent_profile_id: sample.id, field_values_count: count ?? 0 };
  }

  const { data: catalogRows, error: catErr } = await anon
    .from("field_definitions")
    .select("key")
    .eq("key", "height_cm")
    .is("archived_at", null)
    .eq("active", true)
    .limit(1);
  if (catErr) throw catErr;

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: "anon_public_smoke",
        bogus_uuid_lookup_empty: bogusRows == null,
        public_approved_profiles_sample: publicProfiles ?? [],
        field_values_anon_for_first_public: fieldValuesForPublic,
        anon_can_read_height_cm_definition: (catalogRows?.length ?? 0) > 0,
        notes: [
          "bogus_uuid_lookup_empty should be true (RLS: no row for fake id).",
          "If public_approved_profiles_sample is empty, skip field_values count (no public talent in DB).",
          "field_values_anon count > 0 for a public profile indicates catalog RLS + field_values public policy working.",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
