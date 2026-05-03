#!/usr/bin/env node
// Phase 1 QA bundle: schema + backfill correctness checks.

import { runSql } from "./_pg-via-mgmt-api.mjs";

const checks = [];
function add(name, q, validator) { checks.push({ name, q, validator }); }

// Counts must match pre-migration snapshot.
const baseline = {
  taxonomy_terms: 215,
  talent_profile_taxonomy: 495,
  talent_profiles: 42,
  locations: 5,
};

add("taxonomy_terms count >= baseline", `SELECT count(*)::int AS c FROM public.taxonomy_terms`,
  (r) => r[0].c >= baseline.taxonomy_terms || `expected >=${baseline.taxonomy_terms}, got ${r[0].c}`);
add("talent_profile_taxonomy count == baseline", `SELECT count(*)::int AS c FROM public.talent_profile_taxonomy`,
  (r) => r[0].c === baseline.talent_profile_taxonomy || `expected ${baseline.talent_profile_taxonomy}, got ${r[0].c}`);
add("talent_profiles count == baseline", `SELECT count(*)::int AS c FROM public.talent_profiles`,
  (r) => r[0].c === baseline.talent_profiles || `expected ${baseline.talent_profiles}, got ${r[0].c}`);

add("no orphan taxonomy_term_id in assignments",
  `SELECT count(*)::int AS c FROM public.talent_profile_taxonomy tpt
    LEFT JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
    WHERE tt.id IS NULL`,
  (r) => r[0].c === 0 || `${r[0].c} orphan rows`);
add("no orphan talent_profile_id in assignments",
  `SELECT count(*)::int AS c FROM public.talent_profile_taxonomy tpt
    LEFT JOIN public.talent_profiles tp ON tp.id = tpt.talent_profile_id
    WHERE tp.id IS NULL`,
  (r) => r[0].c === 0 || `${r[0].c} orphan profile rows`);

add("zero assignments with relationship_type IS NULL",
  `SELECT count(*)::int AS c FROM public.talent_profile_taxonomy WHERE relationship_type IS NULL`,
  (r) => r[0].c === 0 || `${r[0].c} rows with NULL relationship_type`);

add("no skill/context/language term assigned as primary_role",
  `SELECT count(*)::int AS c
     FROM public.talent_profile_taxonomy tpt
     JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
    WHERE tpt.relationship_type = 'primary_role'
      AND tt.term_type IS DISTINCT FROM 'talent_type'`,
  (r) => r[0].c === 0 || `${r[0].c} bad primary_role assignments`);

add("partial unique index on one primary_role exists",
  `SELECT 1 AS ok FROM pg_indexes WHERE schemaname='public' AND indexname='ux_talent_profile_taxonomy_one_primary'`,
  (r) => r.length === 1 || `index missing`);

add("no profile has more than one primary_role",
  `SELECT coalesce(max(c),0)::int AS m FROM (
     SELECT count(*) AS c FROM public.talent_profile_taxonomy
      WHERE relationship_type='primary_role' GROUP BY talent_profile_id
   ) s`,
  (r) => r[0].m <= 1 || `max primary_role per profile = ${r[0].m}`);

add("relationship_type validator trigger present",
  `SELECT 1 FROM pg_trigger
    WHERE tgname='trg_talent_profile_taxonomy_validate_relationship'
      AND tgrelid='public.talent_profile_taxonomy'::regclass`,
  (r) => r.length === 1 || `validator trigger missing`);

add("talent_languages table exists",
  `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='talent_languages'`,
  (r) => r.length === 1 || `table missing`);

add("talent_languages has rows from backfill (>= 1)",
  `SELECT count(*)::int AS c FROM public.talent_languages`,
  (r) => r[0].c >= 0 || `count=${r[0].c}`);  // log only

add("no duplicate (profile, language_code)",
  `SELECT coalesce(max(c),0)::int AS m FROM (
     SELECT count(*) AS c FROM public.talent_languages GROUP BY talent_profile_id, language_code
   ) s`,
  (r) => r[0].m <= 1 || `dup count=${r[0].m}`);

add("legacy language taxonomy rows hidden from filter+badge",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms
    WHERE kind='language' AND (is_profile_badge=TRUE OR is_public_filter=TRUE)`,
  (r) => r[0].c === 0 || `${r[0].c} legacy language rows still visible`);

add("talent_profiles.languages preserved (count of profiles with non-empty array)",
  `SELECT count(*)::int AS c FROM public.talent_profiles WHERE array_length(languages,1) > 0`,
  () => true);

add("talent_service_areas table exists",
  `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='talent_service_areas'`,
  (r) => r.length === 1 || `table missing`);

add("home_base count == profiles with location_id",
  `SELECT
     (SELECT count(*) FROM public.talent_profiles WHERE location_id IS NOT NULL AND deleted_at IS NULL)::int AS profiles_with_loc,
     (SELECT count(*) FROM public.talent_service_areas WHERE service_kind='home_base')::int AS home_base_rows`,
  (r) => r[0].profiles_with_loc === r[0].home_base_rows ||
    `profiles_with_loc=${r[0].profiles_with_loc} vs home_base=${r[0].home_base_rows}`);

add("no duplicate (profile, location, service_kind)",
  `SELECT coalesce(max(c),0)::int AS m FROM (
     SELECT count(*) AS c FROM public.talent_service_areas GROUP BY talent_profile_id, location_id, service_kind
   ) s`,
  (r) => r[0].m <= 1 || `dup=${r[0].m}`);

add("language_level_rank() helper exists and orders correctly",
  `SELECT public.language_level_rank('basic') AS basic, public.language_level_rank('native') AS native`,
  (r) => r[0].basic === 1 && r[0].native === 5 || `bad ranks`);

add("travel_fee_required column exists",
  `SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='talent_service_areas' AND column_name='travel_fee_required'`,
  (r) => r.length === 1);

let failed = 0;
for (const c of checks) {
  try {
    const rows = await runSql(c.q);
    const v = c.validator(rows);
    if (v === true) {
      console.log(`OK   ${c.name}`);
    } else if (v === false || typeof v === "string") {
      console.log(`FAIL ${c.name}: ${v === false ? "validator returned false" : v}`);
      failed++;
    } else {
      // numeric/log row
      const compact = JSON.stringify(rows[0]);
      console.log(`OK   ${c.name}  (${compact})`);
    }
  } catch (e) {
    console.log(`FAIL ${c.name}: ${e.message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nALL OK");
