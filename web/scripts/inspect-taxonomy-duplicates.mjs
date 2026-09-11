/**
 * What is blocking taxonomy_v2 on the isolated branch.
 *
 * `20260801120000_taxonomy_v2_hierarchy_columns.sql` cannot build
 * `taxonomy_terms_term_type_slug_uniq`, and everything downstream of it — the
 * eleven `taxonomy_terms` columns the field engine reads, the parent-category
 * mappings `field_architecture_v1` asserts, `talent_discover_index` and the
 * publicly-listed triggers the directory journeys need — is missing because of
 * it. A unique index only refuses one thing, so print the rows that refuse it.
 *
 * Read-only. Refuses any target but the isolated branch.
 */

import pg from "pg";
import { assertIsolatedJourneysTarget } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
await client.query("SET default_transaction_read_only = on");

const { rows: totals } = await client.query(
  `SELECT count(*)::int AS terms,
          count(DISTINCT (term_type, slug))::int AS distinct_pairs
     FROM public.taxonomy_terms`,
);
console.log(`\ntaxonomy_terms: ${totals[0].terms} rows, ${totals[0].distinct_pairs} distinct (term_type, slug)\n`);

const { rows: dupes } = await client.query(
  `SELECT term_type, slug, count(*)::int AS copies,
          array_agg(id ORDER BY created_at NULLS LAST) AS ids,
          array_agg(coalesce(name_en, '(no name)') ORDER BY created_at NULLS LAST) AS names,
          array_agg(coalesce(kind::text, '(no kind)') ORDER BY created_at NULLS LAST) AS kinds,
          array_agg(created_at ORDER BY created_at NULLS LAST) AS created
     FROM public.taxonomy_terms
    GROUP BY term_type, slug
   HAVING count(*) > 1
    ORDER BY count(*) DESC, term_type, slug
    LIMIT 40`,
);

if (dupes.length === 0) {
  console.log("no duplicate (term_type, slug) — the index is blocked by something else\n");
} else {
  console.log(`${dupes.length} duplicated (term_type, slug) pair(s) shown:\n`);
  for (const d of dupes) {
    console.log(`  ${d.term_type} / ${d.slug}  ×${d.copies}`);
    for (let i = 0; i < d.ids.length; i += 1) {
      console.log(
        `      ${d.ids[i]}  kind=${d.kinds[i]}  ${d.names[i]}  created ${d.created[i]?.toISOString?.() ?? d.created[i]}`,
      );
    }
  }
  console.log("");
  // A duplicate that nothing points at can go. One with references cannot be
  // dropped without moving them, so count them before anybody deletes a row.
  const { rows: refs } = await client.query(
    `SELECT 'talent_profile_taxonomy' AS via, count(*)::int AS rows
       FROM public.talent_profile_taxonomy
      WHERE taxonomy_term_id IN (
        SELECT id FROM public.taxonomy_terms t
         WHERE EXISTS (
           SELECT 1 FROM public.taxonomy_terms o
            WHERE o.term_type = t.term_type AND o.slug = t.slug AND o.id <> t.id))`,
  );
  for (const r of refs) console.log(`  referenced by ${r.via}: ${r.rows} row(s)`);
  console.log("");
}

await client.end();
