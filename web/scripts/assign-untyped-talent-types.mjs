#!/usr/bin/env node
// Assign a DISTINCT primary + secondary talent_type to every untyped
// active-roster profile, mirroring exactly what the Services skill
// picker's addSkill() does: insert talent_profile_taxonomy rows with
// relationship_type primary_role / secondary_role, is_primary,
// display_order, intermediate proficiency, tenant from the roster.
// Idempotent: PK (talent_profile_id, taxonomy_term_id) + the addSkill
// fix means re-runs are harmless; we also gate on "no primary_role yet".
// Then prints, per talent, how many type-specific fields now resolve
// through the parent chain — verifying the add-type → fields flow.
// Run: node web/scripts/assign-untyped-talent-types.mjs
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
const q = async (query) => {
  const r = await fetch(API, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const b = await r.json(); if (!r.ok || b.message) throw new Error(JSON.stringify(b)); return b;
};

// Distinct (primary, secondary) pairs — varied across categories so no
// two placeholders get the same primary. Secondary is a sensible
// adjacent type. All validated as active non-generic talent_types.
const PAIRS = [
  ["fashion-model", "editorial-model"], ["editorial-model", "runway-model"],
  ["runway-model", "commercial-model"], ["commercial-model", "lifestyle-model"],
  ["lifestyle-model", "beauty-model"], ["beauty-model", "art-model"],
  ["art-model", "fashion-model"], ["event-model", "promotional-model"],
  ["fitness-model", "lifestyle-model"], ["brand-ambassador", "promotional-model"],
  ["content-creator", "influencer"], ["influencer", "content-creator"],
  ["promotional-model", "event-model"], ["corporate-event-host", "private-event-host"],
  ["private-event-host", "wedding-host"], ["wedding-host", "yacht-event-host"],
  ["yacht-event-host", "corporate-event-host"], ["open-format-dj", "entertainer"],
  ["event-photographer", "makeup-artist"], ["makeup-artist", "hair-stylist"],
  ["hair-stylist", "fashion-stylist"], ["fashion-stylist", "makeup-artist"],
  ["entertainer", "open-format-dj"], ["bartender", "promotional-model"],
];

const targets = (await q(
  `SELECT tp.id, tp.display_name, r.tenant_id
   FROM talent_profiles tp
   JOIN agency_talent_roster r ON r.talent_profile_id=tp.id AND r.status='active'
   WHERE NOT EXISTS (SELECT 1 FROM talent_profile_taxonomy x
                     WHERE x.talent_profile_id=tp.id AND x.relationship_type='primary_role')
   ORDER BY tp.id`,
)).filter(Boolean);
console.log("untyped targets:", targets.length);

let assigned = 0;
for (let idx = 0; idx < targets.length; idx++) {
  const t = targets[idx];
  const [primSlug, secSlug] = PAIRS[idx % PAIRS.length];
  // Mirror addSkill: primary_role (is_primary, order 10) + secondary_role (order 20).
  await q(`
    INSERT INTO talent_profile_taxonomy
      (talent_profile_id, taxonomy_term_id, relationship_type, proficiency_level, display_order, tenant_id, is_primary)
    SELECT '${t.id}', tt.id, 'primary_role', 'intermediate', 10, '${t.tenant_id}', true
    FROM taxonomy_terms tt WHERE tt.slug='${primSlug}' AND tt.term_type='talent_type'
    ON CONFLICT (talent_profile_id, taxonomy_term_id) DO NOTHING;
    INSERT INTO talent_profile_taxonomy
      (talent_profile_id, taxonomy_term_id, relationship_type, proficiency_level, display_order, tenant_id, is_primary)
    SELECT '${t.id}', tt.id, 'secondary_role', 'intermediate', 20, '${t.tenant_id}', false
    FROM taxonomy_terms tt WHERE tt.slug='${secSlug}' AND tt.term_type='talent_type'
    ON CONFLICT (talent_profile_id, taxonomy_term_id) DO NOTHING;
  `);
  assigned++;
}
console.log("assigned primary+secondary to:", assigned);

// Verify the add-type -> fields flow: type-specific fields resolved via
// the parent chain for each newly-typed talent (same logic the engine
// resolver uses: rec on an assigned term OR its ancestors).
const verify = await q(`
  WITH RECURSIVE chain AS (
    SELECT tpt.talent_profile_id, tpt.taxonomy_term_id AS id, tt.parent_id
    FROM talent_profile_taxonomy tpt
    JOIN taxonomy_terms tt ON tt.id=tpt.taxonomy_term_id
    WHERE tpt.relationship_type IN ('primary_role','secondary_role')
    UNION ALL
    SELECT c.talent_profile_id, t.id, t.parent_id
    FROM taxonomy_terms t JOIN chain c ON t.id=c.parent_id
  )
  SELECT tp.display_name,
         (SELECT tt2.slug FROM talent_profile_taxonomy z JOIN taxonomy_terms tt2 ON tt2.id=z.taxonomy_term_id
          WHERE z.talent_profile_id=tp.id AND z.relationship_type='primary_role' LIMIT 1) AS primary_type,
         count(DISTINCT r.field_definition_id) AS resolved_type_fields
  FROM talent_profiles tp
  JOIN chain c ON c.talent_profile_id=tp.id
  JOIN profile_field_recommendations r ON r.taxonomy_term_id=c.id
  JOIN profile_field_definitions fd ON fd.id=r.field_definition_id AND fd.tier='type-specific' AND fd.deprecated_at IS NULL
  WHERE tp.id IN (${targets.map((t) => `'${t.id}'`).join(",") || "''"})
  GROUP BY tp.display_name, tp.id
  ORDER BY tp.display_name
`);
console.log("field-resolution check (talent -> primary_type -> #type-specific fields):");
console.log(JSON.stringify(verify, null, 0));
