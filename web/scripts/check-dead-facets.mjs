#!/usr/bin/env node
/**
 * check-dead-facets.mjs — "does every directory facet have anything to match?"
 *
 * WHY THIS EXISTS
 * The 2026-09-01 Directory & Profile Engine audit found FIVE directory filters
 * that could not return a result: `tags`, `industries`, `event_types`,
 * `fit_labels` and `languages` were all flagged `show_in_directory_filter` with
 * zero stored values across all 92 profiles. A visitor could open each one and
 * only ever get nothing back. That reads as a broken directory, not an empty
 * one, and nothing in the codebase could notice — fill rate is data, so no
 * static test can see it.
 *
 * NOT A BLOCKING CI GATE, AND DELIBERATELY SO.
 * The structural CI lane runs without database credentials (see the comment at
 * .github/workflows/ci.yml — `check:migrations-applied` is excluded for exactly
 * this reason). So this is an OPERATOR check in the `deploy:smoke` family: run
 * it after a deploy, or whenever the field catalog changes. It follows the same
 * contract as check-migrations-applied.mjs — hard-fail if CI=true and creds are
 * missing (so it can never silently no-op inside a pipeline that DOES have
 * them), otherwise skip with a notice.
 *
 * WHAT IT REPORTS
 *   FAIL  a field flagged show_in_directory_filter / show_in_directory_card
 *         with zero non-empty values platform-wide.
 *   WARN  a filterable field whose values sit on 1-2 profiles — technically
 *         alive, practically a facet that filters the roster down to one
 *         person. Worth a look, never a failure.
 *
 * KNOWN EXCEPTION — `languages`. It is zero-fill in
 * `talent_profile_field_values`, but 36 profiles DO have real language data in
 * the `talent_languages` table; the facet simply reads the wrong source. It is
 * listed under SOURCE MISMATCH rather than counted as dead, so retiring it is
 * never the suggested fix.
 *
 * Auth: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Usage: npm run check:dead-facets
 */

import { createClient } from "@supabase/supabase-js";

/**
 * TAXONOMY-BACKED FACETS — read `talent_profile_taxonomy`, NOT the scalar
 * value table.
 *
 * This map exists because its absence caused a real regression. An earlier
 * pass measured these facets against `talent_profile_field_values`, found
 * zero rows, and retired four of them — two of which (industries, 19
 * profiles; event_types, 18 profiles) were working perfectly. Their values
 * had simply never lived in the scalar table.
 *
 * field_key → the `taxonomy_terms.kind` that supplies its vocabulary.
 */
const TAXONOMY_BACKED_FACETS = {
  tags: "tag",
  industries: "industry",
  event_types: "event_type",
  fit_labels: "fit_label",
  skills: "skill",
  languages: "language",
};

/**
 * Facets whose values live in a dedicated table — neither store above.
 * `languages` is declared taxonomy-backed but has ZERO terms of kind
 * "language"; its real data is 108 rows in `talent_languages`. Retiring it
 * would be the wrong fix, so it is reported separately.
 */
const ALTERNATE_SOURCE_FACETS = {
  languages: "talent_languages",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  if (process.env.CI === "true") {
    console.error(
      "[check-dead-facets] FATAL: running in CI but NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    );
    process.exit(1);
  }
  console.warn(
    "[check-dead-facets] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping. To enforce, set both env vars.",
  );
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: defs, error: defsErr } = await sb
  .from("profile_field_definitions")
  .select(
    "id, field_key, show_in_directory_filter, show_in_directory_card, show_in_public_profile_sidebar",
  )
  .is("deprecated_at", null);

if (defsErr) {
  console.error(`[check-dead-facets] could not read the field catalog: ${defsErr.message}`);
  process.exit(1);
}

const surfaced = (defs ?? []).filter(
  (d) =>
    d.show_in_directory_filter === true ||
    d.show_in_directory_card === true ||
    d.show_in_public_profile_sidebar === true,
);

if (surfaced.length === 0) {
  console.log("[check-dead-facets] no fields are surfaced on the directory. Nothing to check.");
  process.exit(0);
}

// Fill count per definition. Empty JSON shapes ('', [], {}) are NOT a value.
const fill = new Map(surfaced.map((d) => [d.id, new Set()]));
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb
    .from("talent_profile_field_values")
    .select("field_definition_id, talent_profile_id, value")
    .in("field_definition_id", surfaced.map((d) => d.id))
    .range(from, from + PAGE - 1);
  if (error) {
    console.error(`[check-dead-facets] could not read field values: ${error.message}`);
    process.exit(1);
  }
  for (const row of data ?? []) {
    const v = row.value;
    const empty =
      v === null ||
      v === undefined ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
    if (!empty) fill.get(row.field_definition_id)?.add(row.talent_profile_id);
  }
  if (!data || data.length < PAGE) break;
}

const surfaceLabel = (d) =>
  [
    d.show_in_directory_filter ? "filter" : null,
    d.show_in_directory_card ? "card" : null,
    d.show_in_public_profile_sidebar ? "sidebar" : null,
  ]
    .filter(Boolean)
    .join(" + ");

const dead = [];
const thin = [];
const mismatched = [];

// Taxonomy-backed facets: fill comes from talent_profile_taxonomy via the
// term vocabulary, so overlay those counts before judging anything.
for (const [fieldKey, kind] of Object.entries(TAXONOMY_BACKED_FACETS)) {
  const def = surfaced.find((d) => d.field_key === fieldKey);
  if (!def) continue;
  const { data: terms, error: termsErr } = await sb
    .from("taxonomy_terms")
    .select("id")
    .eq("kind", kind);
  if (termsErr) {
    console.error(`[check-dead-facets] could not read ${kind} terms: ${termsErr.message}`);
    process.exit(1);
  }
  const termIds = (terms ?? []).map((t) => t.id);
  const holders = new Set();
  for (let i = 0; i < termIds.length; i += 200) {
    const { data: asg } = await sb
      .from("talent_profile_taxonomy")
      .select("talent_profile_id")
      .in("taxonomy_term_id", termIds.slice(i, i + 200));
    for (const a of asg ?? []) holders.add(a.talent_profile_id);
  }
  fill.set(def.id, holders);
}

for (const d of surfaced) {
  const n = fill.get(d.id)?.size ?? 0;
  if (n === 0) {
    if (ALTERNATE_SOURCE_FACETS[d.field_key]) mismatched.push({ d, n });
    else dead.push({ d, n });
  } else if (n <= 2) {
    thin.push({ d, n });
  }
}

for (const { d } of mismatched) {
  console.log(
    `SOURCE MISMATCH  ${d.field_key} (${surfaceLabel(d)}) — no values in talent_profile_field_values, but this facet's data lives in ${ALTERNATE_SOURCE_FACETS[d.field_key]}. Repoint the read; do not retire it.`,
  );
}
for (const { d, n } of thin) {
  console.log(`WARN  ${d.field_key} (${surfaceLabel(d)}) — only ${n} profile(s) have a value.`);
}
for (const { d } of dead) {
  console.error(
    `FAIL  ${d.field_key} (${surfaceLabel(d)}) — zero profiles have a value. This surface can only ever render nothing.`,
  );
}

console.log(
  `\n[check-dead-facets] ${surfaced.length} surfaced field(s): ${dead.length} dead, ${thin.length} thin, ${mismatched.length} source-mismatched.`,
);

if (dead.length > 0) {
  console.error(
    "\nA facet that always returns zero is worse than no facet. Either fill it, repoint it, or clear its surface flags in a migration.",
  );
  process.exit(1);
}
process.exit(0);
