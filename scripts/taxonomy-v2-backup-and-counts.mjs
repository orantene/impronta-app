#!/usr/bin/env node
// Backup + row count snapshot for the Taxonomy v2 PR.
// Uses the Supabase Management API (no direct DB DNS required).

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runSql } from "./_pg-via-mgmt-api.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const TABLES = ["taxonomy_terms", "talent_profile_taxonomy", "talent_profiles", "locations", "agencies"];
const outDir = path.resolve(root, ".codex-artifacts/taxonomy-v2-backup");
mkdirSync(outDir, { recursive: true });

const counts = {};

for (const t of TABLES) {
  const c = await runSql(`SELECT count(*)::int AS c FROM public."${t}"`);
  counts[t] = c[0].c;
  // Dump full rows as JSON. For large tables we'd page, but these are <10k.
  const rows = await runSql(`SELECT row_to_json(t) AS j FROM public."${t}" t`);
  writeFileSync(path.join(outDir, `${t}.json`), JSON.stringify(rows.map((x) => x.j), null, 2));
}

const orphanAssign = await runSql(`
  SELECT count(*)::int AS c
    FROM public.talent_profile_taxonomy tpt
    LEFT JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
   WHERE tt.id IS NULL
`);
counts._orphan_assignments_taxonomy_missing = orphanAssign[0].c;

const orphanAssignProfile = await runSql(`
  SELECT count(*)::int AS c
    FROM public.talent_profile_taxonomy tpt
    LEFT JOIN public.talent_profiles tp ON tp.id = tpt.talent_profile_id
   WHERE tp.id IS NULL
`);
counts._orphan_assignments_profile_missing = orphanAssignProfile[0].c;

const primaryByProfile = await runSql(`
  SELECT count(*)::int AS profiles_with_primary,
         coalesce(sum(CASE WHEN c > 1 THEN 1 ELSE 0 END), 0)::int AS profiles_with_multiple_primary
    FROM (
      SELECT talent_profile_id, count(*) AS c
        FROM public.talent_profile_taxonomy tpt
        JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
       WHERE tt.kind::text = 'talent_type' AND tpt.is_primary = TRUE
       GROUP BY talent_profile_id
    ) s
`);
counts._profiles_with_primary_talent_type = primaryByProfile[0].profiles_with_primary;
counts._profiles_with_multiple_primary = primaryByProfile[0].profiles_with_multiple_primary;

writeFileSync(path.join(outDir, "counts.json"), JSON.stringify(counts, null, 2));
console.log("BACKUP OK ->", outDir);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
