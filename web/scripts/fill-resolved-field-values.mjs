#!/usr/bin/env node
// Fill EACH typed active-roster talent's OWN resolved field set with
// realistic, kind-valid values (so every talent type renders fully —
// not just models). Resolved set = universal + global + type-specific
// recommended via the parent chain of the talent's assigned roles
// (same logic the engine resolver uses). Value is generated per field
// `kind` with deterministic per-(talent,field) variation:
//   select      -> a real option from fd.options
//   multiselect -> 1–2 real options
//   number      -> sensible range by field-key heuristic
//   toggle      -> deterministic boolean
//   date        -> DOB-style or recent date
//   text(known) -> realistic template (handles/urls/notable work)
//   chips/other  -> skipped (renders as a clean empty input, no fake filler)
// Idempotent: ON CONFLICT (talent_profile_id, field_definition_id)
// DO NOTHING — preserves curated/existing values, only fills gaps.
// Run: node web/scripts/fill-resolved-field-values.mjs
import { readFileSync, existsSync } from "node:fs";
const envFile = "/Users/oranpersonal/Desktop/impronta-app/web/.env.vercel.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("="); if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
  }
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;
const run = async (query) => {
  const r = await fetch(API, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const b = await r.json(); if (!r.ok || b.message) throw new Error(JSON.stringify(b)); return b;
};

const SQL = `
WITH RECURSIVE
chain AS (
  SELECT tpt.talent_profile_id AS tpid, tpt.taxonomy_term_id AS id, tt.parent_id
  FROM talent_profile_taxonomy tpt
  JOIN taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
  WHERE tpt.relationship_type IN ('primary_role','secondary_role')
  UNION ALL
  SELECT c.tpid, t.id, t.parent_id
  FROM taxonomy_terms t JOIN chain c ON t.id = c.parent_id
),
roster AS (
  SELECT DISTINCT tp.id AS tpid
  FROM talent_profiles tp
  JOIN agency_talent_roster r ON r.talent_profile_id = tp.id AND r.status = 'active'
  WHERE EXISTS (SELECT 1 FROM talent_profile_taxonomy x
                WHERE x.talent_profile_id = tp.id AND x.relationship_type = 'primary_role')
),
resolved AS (   -- (talent, field) pairs the engine would render
  SELECT r.tpid, fd.id AS fdid, fd.field_key, fd.kind, fd.options
  FROM roster r
  JOIN profile_field_definitions fd
    ON fd.deprecated_at IS NULL
   AND ( fd.tier IN ('universal','global')
         OR EXISTS ( SELECT 1
                     FROM profile_field_recommendations pr
                     JOIN chain c ON c.id = pr.taxonomy_term_id AND c.tpid = r.tpid
                     WHERE pr.field_definition_id = fd.id ) )
),
gen AS (
  SELECT res.tpid, res.fdid, res.field_key, res.kind, res.options,
         ('x' || substr(md5(res.tpid::text || res.field_key), 1, 7))::bit(28)::int AS h
  FROM resolved res
)
INSERT INTO talent_profile_field_values
  (talent_profile_id, field_definition_id, value, tenant_id, workflow_state, last_edited_role)
SELECT g.tpid, g.fdid,
  CASE
    WHEN g.kind IN ('toggle','boolean') THEN to_jsonb((g.h % 4) <> 0)
    WHEN g.kind = 'select' AND jsonb_typeof(g.options)='array' AND jsonb_array_length(g.options) > 0
         THEN (g.options -> (g.h % jsonb_array_length(g.options)))
    WHEN g.kind = 'multiselect' AND jsonb_typeof(g.options)='array' AND jsonb_array_length(g.options) > 0
         THEN jsonb_build_array(
                g.options -> (g.h % jsonb_array_length(g.options)),
                g.options -> ((g.h + 1) % jsonb_array_length(g.options)))
    WHEN g.kind = 'number' THEN to_jsonb(
        CASE
          WHEN g.field_key ILIKE '%height%'                         THEN 165 + (g.h % 22)
          WHEN g.field_key ILIKE '%weight%'                         THEN 52 + (g.h % 30)
          WHEN g.field_key ILIKE '%bust%'                           THEN 80 + (g.h % 18)
          WHEN g.field_key ILIKE '%waist%'                          THEN 60 + (g.h % 16)
          WHEN g.field_key ILIKE '%hip%'                            THEN 86 + (g.h % 18)
          WHEN g.field_key ILIKE '%inseam%'                         THEN 72 + (g.h % 14)
          WHEN g.field_key ILIKE '%year%' OR g.field_key ILIKE '%experience%' THEN 2 + (g.h % 14)
          WHEN g.field_key ILIKE '%age%'                            THEN 21 + (g.h % 18)
          WHEN g.field_key ILIKE '%size%'                           THEN 36 + (g.h % 9)
          WHEN g.field_key ILIKE '%radius%' OR g.field_key ILIKE '%notice%' OR g.field_key ILIKE '%hours%' THEN 2 + (g.h % 22)
          WHEN g.field_key ILIKE '%group%' OR g.field_key ILIKE '%capacity%' OR g.field_key ILIKE '%max%' OR g.field_key ILIKE '%count%' THEN 1 + (g.h % 12)
          ELSE 1 + (g.h % 10)
        END)
    WHEN g.kind = 'date' THEN to_jsonb(
        CASE WHEN g.field_key ILIKE '%dob%' OR g.field_key ILIKE '%birth%'
             THEN to_char(DATE '1988-01-01' + ((g.h % 4200))::int, 'YYYY-MM-DD')
             ELSE to_char(CURRENT_DATE - ((g.h % 700))::int, 'YYYY-MM-DD') END)
    WHEN g.kind IN ('text','textarea') AND g.field_key ILIKE '%instagram%'
         THEN to_jsonb('@' || lower(regexp_replace((SELECT display_name FROM talent_profiles WHERE id=g.tpid), '[^a-zA-Z]', '', 'g')) || '.tulum')
    WHEN g.kind IN ('text','textarea') AND (g.field_key ILIKE '%tiktok%' OR g.field_key ILIKE '%youtube%' OR g.field_key ILIKE '%handle%')
         THEN to_jsonb('@' || lower(regexp_replace((SELECT display_name FROM talent_profiles WHERE id=g.tpid), '[^a-zA-Z]', '', 'g')))
    WHEN g.kind IN ('text','textarea') AND (g.field_key ILIKE '%website%' OR g.field_key ILIKE '%url%' OR g.field_key ILIKE '%link%' OR g.field_key ILIKE '%reel%' OR g.field_key ILIKE '%portfolio%')
         THEN to_jsonb('https://' || lower(regexp_replace((SELECT display_name FROM talent_profiles WHERE id=g.tpid), '[^a-zA-Z]', '', 'g')) || '.demo')
    WHEN g.kind IN ('text','textarea') AND (g.field_key ILIKE '%notable%' OR g.field_key ILIKE '%highlight%' OR g.field_key ILIKE '%credit%' OR g.field_key ILIKE '%bio%' OR g.field_key ILIKE '%about%' OR g.field_key ILIKE '%note%' OR g.field_key ILIKE '%skill%' OR g.field_key ILIKE '%summary%')
         THEN to_jsonb('Experienced professional with a strong portfolio of campaign and event work across Tulum and Mexico City.'::text)
    ELSE NULL::jsonb
  END AS val,
  '00000000-0000-0000-0000-000000000001', 'live', 'platform'
FROM gen g
WHERE TRUE
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;
`;

const before = await run("SELECT count(*) n FROM talent_profile_field_values");
console.log("total field values BEFORE:", JSON.stringify(before));
// Filter NULL-value rows out: a partial pre-pass would insert nulls.
await run(SQL.replace("ON CONFLICT", "AND ( CASE\n    WHEN g.kind IN ('toggle','boolean','number','date') THEN true\n    WHEN g.kind IN ('select','multiselect') AND jsonb_typeof(g.options)='array' AND jsonb_array_length(g.options)>0 THEN true\n    WHEN g.kind IN ('text','textarea') AND (g.field_key ILIKE '%instagram%' OR g.field_key ILIKE '%tiktok%' OR g.field_key ILIKE '%youtube%' OR g.field_key ILIKE '%handle%' OR g.field_key ILIKE '%website%' OR g.field_key ILIKE '%url%' OR g.field_key ILIKE '%link%' OR g.field_key ILIKE '%reel%' OR g.field_key ILIKE '%portfolio%' OR g.field_key ILIKE '%notable%' OR g.field_key ILIKE '%highlight%' OR g.field_key ILIKE '%credit%' OR g.field_key ILIKE '%bio%' OR g.field_key ILIKE '%about%' OR g.field_key ILIKE '%note%' OR g.field_key ILIKE '%skill%' OR g.field_key ILIKE '%summary%') THEN true\n    ELSE false END )\nON CONFLICT"));
const after = await run("SELECT count(*) n FROM talent_profile_field_values");
console.log("total field values AFTER:", JSON.stringify(after));
const sample = await run(
  "SELECT tp.display_name, count(*) vals FROM talent_profiles tp JOIN talent_profile_field_values v ON v.talent_profile_id=tp.id WHERE tp.profile_code IN ('TAL-00039','TAL-AUDIT-0512','TAL-00014','TAL-92001','TAL-00033') GROUP BY tp.display_name ORDER BY vals DESC",
);
console.log("sample (Popi/DJ, QA/photographer, Alba/model, Sofía, Tina):", JSON.stringify(sample));
