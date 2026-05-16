#!/usr/bin/env node
// Seed realistic, type-appropriate talent_profile_field_values for the
// empty TYPED active-roster talents, by cloning a proven template
// talent's value set (valid shapes, renders correctly everywhere) and
// applying deterministic per-talent variation to the visible casting
// attributes so profiles look real and distinct (not identical clones).
//
//   Sofía Herrera (TAL-92001, commercial-model)  -> all *model* + hostess
//   Carmen Díaz   (TAL-92002, influencer)        -> creator/influencer/ambassador
//   Marco Sánchez (TAL-92004, actor)             -> actor/dj/photographer/host/etc.
//
// Idempotent: only fills talents with ZERO values; ON CONFLICT skips.
// Run: node web/scripts/seed-roster-field-values.mjs
import { readFileSync, existsSync } from "node:fs";

const envFile = "/Users/oranpersonal/Desktop/impronta-app/web/.env.vercel.local";
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
  }
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function run(query) {
  const res = await fetch(SQL_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok || body.message) throw new Error(JSON.stringify(body));
  return body;
}

// One idempotent INSERT…SELECT. Per-talent hash h drives the variation.
const SEED_SQL = `
WITH targets AS (
  SELECT tp.id AS tid,
         tt.slug AS ptype,
         ('x' || substr(md5(tp.id::text), 1, 7))::bit(28)::int AS h,
         CASE
           WHEN tt.slug LIKE '%model%' OR tt.slug IN ('hostess','event-model') THEN 'TAL-92001'
           WHEN tt.slug IN ('content-creator','brand-ambassador','influencer') THEN 'TAL-92002'
           ELSE 'TAL-92004'
         END AS template_code
  FROM talent_profiles tp
  JOIN agency_talent_roster r ON r.talent_profile_id = tp.id AND r.status = 'active'
  JOIN talent_profile_taxonomy tpt ON tpt.talent_profile_id = tp.id AND tpt.relationship_type = 'primary_role'
  JOIN taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
  WHERE NOT EXISTS (SELECT 1 FROM talent_profile_field_values v WHERE v.talent_profile_id = tp.id)
)
INSERT INTO talent_profile_field_values
  (talent_profile_id, field_definition_id, value, tenant_id, workflow_state, last_edited_role)
SELECT
  t.tid,
  sv.field_definition_id,
  CASE fd.field_key
    WHEN 'physical.height_cm'  THEN to_jsonb(165 + (t.h % 22))
    WHEN 'physical.weight_kg'  THEN to_jsonb(52 + (t.h % 28))
    WHEN 'physical.bust_cm'    THEN to_jsonb(82 + (t.h % 18))
    WHEN 'physical.waist_cm'   THEN to_jsonb(60 + (t.h % 16))
    WHEN 'physical.hips_cm'    THEN to_jsonb(86 + (t.h % 18))
    WHEN 'physical.hair_color' THEN to_jsonb((ARRAY['Black','Dark brown','Brown','Light brown','Blonde','Auburn'])[(t.h % 6) + 1])
    WHEN 'physical.eye_color'  THEN to_jsonb((ARRAY['Brown','Blue','Green','Hazel','Amber'])[(t.h % 5) + 1])
    WHEN 'physical.hair_length' THEN to_jsonb((ARRAY['Short','Medium','Long','Extra long'])[(t.h % 4) + 1])
    WHEN 'physical.body_type'  THEN to_jsonb((ARRAY['Slim','Athletic','Curvy'])[(t.h % 3) + 1])
    WHEN 'physical.skin_tone'  THEN to_jsonb((ARRAY['Fair','Light','Medium','Olive','Tan'])[(t.h % 5) + 1])
    WHEN 'physical.dress_size' THEN to_jsonb((ARRAY['XS','S','M','L'])[(t.h % 4) + 1])
    WHEN 'physical.shoe_size_eu' THEN to_jsonb((36 + (t.h % 8))::text)
    ELSE sv.value
  END,
  '00000000-0000-0000-0000-000000000001',
  'live',
  'platform'
FROM targets t
JOIN talent_profiles tmpl ON tmpl.profile_code = t.template_code
JOIN talent_profile_field_values sv ON sv.talent_profile_id = tmpl.id
JOIN profile_field_definitions fd ON fd.id = sv.field_definition_id AND fd.deprecated_at IS NULL
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;
`;

const before = await run(
  "SELECT count(*) n FROM talent_profiles tp JOIN agency_talent_roster r ON r.talent_profile_id=tp.id AND r.status='active' JOIN talent_profile_taxonomy x ON x.talent_profile_id=tp.id AND x.relationship_type='primary_role' WHERE NOT EXISTS (SELECT 1 FROM talent_profile_field_values v WHERE v.talent_profile_id=tp.id)",
);
console.log("empty typed active-roster talents BEFORE:", JSON.stringify(before));
await run(SEED_SQL);
const after = await run(
  "SELECT count(*) n FROM talent_profiles tp JOIN agency_talent_roster r ON r.talent_profile_id=tp.id AND r.status='active' JOIN talent_profile_taxonomy x ON x.talent_profile_id=tp.id AND x.relationship_type='primary_role' WHERE NOT EXISTS (SELECT 1 FROM talent_profile_field_values v WHERE v.talent_profile_id=tp.id)",
);
console.log("empty typed active-roster talents AFTER:", JSON.stringify(after));
const sample = await run(
  "SELECT tp.display_name, count(*) vals FROM talent_profiles tp JOIN talent_profile_field_values v ON v.talent_profile_id=tp.id JOIN agency_talent_roster r ON r.talent_profile_id=tp.id AND r.status='active' GROUP BY tp.display_name ORDER BY tp.display_name LIMIT 12",
);
console.log("populated sample:", JSON.stringify(sample));
