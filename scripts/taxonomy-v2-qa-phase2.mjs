#!/usr/bin/env node
// Phase 2 QA bundle: seed correctness + hierarchy + no-live-damage checks.

import { runSql } from "./_pg-via-mgmt-api.mjs";

const checks = [];
function add(name, q, validator) { checks.push({ name, q, validator }); }

// ── parents ───────────────────────────────────────────────────────────────
add("19 parent_categories exist",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='parent_category'`,
  (r) => r[0].c === 19 || `got ${r[0].c}`);

add("8 parent_categories flagged is_public_filter=TRUE (top-bar)",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='parent_category' AND is_public_filter=TRUE`,
  (r) => r[0].c === 8 || `got ${r[0].c}`);

add("11 parent_categories with is_public_filter=FALSE (More rollup)",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='parent_category' AND is_public_filter=FALSE`,
  (r) => r[0].c === 11 || `got ${r[0].c}`);

// ── legacy mapping (IDs preserved) ────────────────────────────────────────
add("legacy 'model' row preserved + reattached to general-models",
  `SELECT
     (SELECT id FROM public.taxonomy_terms WHERE kind='talent_type' AND slug='model') AS model_id,
     (SELECT parent_id FROM public.taxonomy_terms WHERE kind='talent_type' AND slug='model') AS parent_id,
     (SELECT id FROM public.taxonomy_terms WHERE term_type='category_group' AND slug='general-models') AS general_models_id`,
  (r) => r[0].model_id !== null
       && r[0].general_models_id !== null
       && r[0].parent_id === r[0].general_models_id
       || `model.parent=${r[0].parent_id}, expected ${r[0].general_models_id}`);

add("legacy 'hostess' row preserved + reattached to general-hostesses",
  `SELECT
     (SELECT parent_id FROM public.taxonomy_terms WHERE kind='talent_type' AND slug='hostess') AS p,
     (SELECT id FROM public.taxonomy_terms WHERE term_type='category_group' AND slug='general-hostesses') AS gh`,
  (r) => r[0].p === r[0].gh || `hostess.parent=${r[0].p} vs ${r[0].gh}`);

add("legacy 'dancer' row preserved + reattached to general-dancers",
  `SELECT
     (SELECT parent_id FROM public.taxonomy_terms WHERE kind='talent_type' AND slug='dancer') AS p,
     (SELECT id FROM public.taxonomy_terms WHERE term_type='category_group' AND slug='general-dancers') AS gd`,
  (r) => r[0].p === r[0].gd || `dancer.parent=${r[0].p} vs ${r[0].gd}`);

add("legacy 'promotional-model' attached to promotional-models",
  `SELECT
     (SELECT parent_id FROM public.taxonomy_terms WHERE kind='talent_type' AND slug='promotional-model') AS p,
     (SELECT id FROM public.taxonomy_terms WHERE term_type='category_group' AND slug='promotional-models') AS pm`,
  (r) => r[0].p === r[0].pm || `promotional-model.parent=${r[0].p} vs ${r[0].pm}`);

add("no duplicate replacement rows for legacy slugs (1 row per slug in talent_type kind)",
  `SELECT slug, count(*)::int AS c
     FROM public.taxonomy_terms
    WHERE kind='talent_type' AND slug IN ('model','hostess','dancer','promotional-model','singer','dj','brand-ambassador')
    GROUP BY slug HAVING count(*) > 1`,
  (r) => r.length === 0 || `dupes: ${JSON.stringify(r)}`);

// ── hierarchy + recursive search ──────────────────────────────────────────
add("descendants_of() returns descendants of Performers",
  `SELECT count(*)::int AS c FROM public.descendants_of(public.taxv1_uuid('parent_category','performers'))`,
  (r) => r[0].c >= 20 || `got ${r[0].c} (expected dancers + specialty performers + stage acts)`);

add("descendants_of(Performers) includes fire-dancer",
  `SELECT count(*)::int AS c
     FROM public.descendants_of(public.taxv1_uuid('parent_category','performers')) d
     JOIN public.taxonomy_terms t ON t.id = d.id
    WHERE t.slug='fire-dancer'`,
  (r) => r[0].c === 1);

add("descendants_of(Performers) includes magician",
  `SELECT count(*)::int AS c
     FROM public.descendants_of(public.taxv1_uuid('parent_category','performers')) d
     JOIN public.taxonomy_terms t ON t.id = d.id
    WHERE t.slug='magician'`,
  (r) => r[0].c === 1);

add("descendants_of(Dancers) includes salsa specialty",
  `SELECT count(*)::int AS c
     FROM public.descendants_of(public.taxv1_uuid('category_group','dancers')) d
     JOIN public.taxonomy_terms t ON t.id = d.id
    WHERE t.slug='salsa'`,
  (r) => r[0].c === 1);

add("descendants_of(Models) includes legacy 'model' (proves preservation)",
  `SELECT count(*)::int AS c
     FROM public.descendants_of(public.taxv1_uuid('parent_category','models')) d
     JOIN public.taxonomy_terms t ON t.id = d.id
    WHERE t.slug='model' AND t.kind='talent_type'`,
  (r) => r[0].c === 1);

// ── duplicate-role canonical strategy ─────────────────────────────────────
add("Bartender: exactly 1 canonical talent_type",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='talent_type' AND slug='bartender'`,
  (r) => r[0].c === 1);

add("Bartender canonical home is Beverage Talent",
  `SELECT
     (SELECT parent_id FROM public.taxonomy_terms WHERE term_type='talent_type' AND slug='bartender') AS p,
     (SELECT id FROM public.taxonomy_terms WHERE term_type='category_group' AND slug='beverage-talent') AS bt`,
  (r) => r[0].p === r[0].bt);

add("Fire Dancer search synonyms populated",
  `SELECT search_synonyms FROM public.taxonomy_terms WHERE term_type='talent_type' AND slug='fire-dancer'`,
  (r) => Array.isArray(r[0].search_synonyms) && r[0].search_synonyms.length >= 3 || `got ${JSON.stringify(r[0].search_synonyms)}`);

add("Bar Staff (category_group) has cross-discovery synonyms",
  `SELECT search_synonyms FROM public.taxonomy_terms WHERE term_type='category_group' AND slug='bar-staff'`,
  (r) => Array.isArray(r[0].search_synonyms) && r[0].search_synonyms.includes('bartender'));

// ── no live damage ────────────────────────────────────────────────────────
add("talent_profiles count unchanged (42)",
  `SELECT count(*)::int AS c FROM public.talent_profiles`,
  (r) => r[0].c === 42 || `got ${r[0].c}`);

add("talent_profile_taxonomy count unchanged (495)",
  `SELECT count(*)::int AS c FROM public.talent_profile_taxonomy`,
  (r) => r[0].c === 495 || `got ${r[0].c}`);

add("every live profile keeps a primary_role",
  `SELECT count(DISTINCT talent_profile_id)::int AS c
     FROM public.talent_profile_taxonomy WHERE relationship_type='primary_role'`,
  (r) => r[0].c === 42 || `got ${r[0].c}`);

add("no orphan assignments after seed",
  `SELECT count(*)::int AS c FROM public.talent_profile_taxonomy tpt
    LEFT JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
    WHERE tt.id IS NULL`,
  (r) => r[0].c === 0);

// ── seed totals ───────────────────────────────────────────────────────────
add("category_groups seeded (>= 70)",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='category_group'`,
  (r) => r[0].c >= 70 || `got ${r[0].c}`);

add("talent_types seeded (>= 220)",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='talent_type'`,
  (r) => r[0].c >= 220 || `got ${r[0].c}`);

add("specialties seeded (>= 20)",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='specialty'`,
  (r) => r[0].c >= 20 || `got ${r[0].c}`);

add("skill_groups seeded (== 9)",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='skill_group'`,
  (r) => r[0].c === 9 || `got ${r[0].c}`);

add("skills seeded (>= 100)",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='skill'`,
  (r) => r[0].c >= 100 || `got ${r[0].c}`);

add("contexts seeded (>= 25)",
  `SELECT count(*)::int AS c FROM public.taxonomy_terms WHERE term_type='context'`,
  (r) => r[0].c >= 25 || `got ${r[0].c}`);

add("descendants_of() function exists",
  `SELECT 1 FROM pg_proc WHERE proname='descendants_of' AND pronamespace='public'::regnamespace`,
  (r) => r.length >= 1);

let failed = 0;
for (const c of checks) {
  try {
    const rows = await runSql(c.q);
    const v = c.validator(rows);
    if (v === true || v === undefined) {
      console.log(`OK   ${c.name}`);
    } else if (v === false || typeof v === "string") {
      console.log(`FAIL ${c.name}: ${v === false ? "validator returned false" : v}`);
      failed++;
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
