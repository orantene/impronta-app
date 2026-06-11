#!/usr/bin/env node
// ============================================================================
// field-parity-harness.mjs — A-read vs B-read parity proof engine (READ-ONLY)
// ============================================================================
//
// WHY THIS EXISTS
// The field-engine unification program (Phases 1–3) repoints readers from the
// legacy field system (System A: `field_definitions` + `field_values`) to the
// canonical system (System B: `profile_field_definitions` +
// `talent_profile_field_values`), one surface at a time. Every repoint must
// ship a parity proof: "for these key pairs, on this cohort, an A-read and a
// B-read agree N% of the time, and here are the diffs." This script is that
// proof engine — run it before a repoint (baseline) and after (no regression).
//
// SAFETY — READ-ONLY. NO WRITES, EVER.
// localhost dev points at PROD Supabase (ref pluhdapdnuiulvxmyspd), a small
// shared compute. Concurrent DB fan-out has taken the live site down before.
// This script issues ONLY SELECTs, runs them SEQUENTIALLY (never concurrent),
// and prefers ONE consolidated query that computes the whole agreement table
// server-side. It never INSERTs/UPDATEs/DELETEs and never runs DDL.
//
// DB ACCESS — Supabase Management API SQL endpoint (same pattern as
// apply-migration.mjs). Pure HTTPS, no IPv6/pooler dependency.
//
// USAGE
//   cd web && node --env-file=.env.local --env-file=.env.vercel.local \
//     scripts/field-parity-harness.mjs [--cohort=all|public-approved|both]
//                                       [--samples=5] [--json]
//
//   Defaults: --cohort=both, --samples=5, human-readable tables.
//   The key-set defaults to the 17 bridged keys (legacy-mirror NEW_TO_OLD_KEY)
//   plus the height + gender three-way coverage. To run a custom key-set, edit
//   the KEY_PAIRS block below (kept as a code config so the harness is a single
//   self-contained file outside the tsc surface).
//
// ENV REQUIRED
//   SUPABASE_ACCESS_TOKEN     (in .env.vercel.local)
//   NEXT_PUBLIC_SUPABASE_URL  (in .env.local) — project ref is derived from it.
//
// EXIT CODES
//   0 — ran and printed the agreement table(s).
//   1 — missing env / SQL error / network error.
// ============================================================================

// ---------------------------------------------------------------------------
// Config — the bridged key pairs (System-B canonical key → System-A legacy key).
// Mirror of `web/src/lib/fields/legacy-mirror.ts` NEW_TO_OLD_KEY, verified
// against the live registries on 2026-06-10 (all present in both). `gender`
// is appended because T1.1 needs its three-way coverage even though it is not
// in the bridge map (gender is kept dedicated / not auto-mirrored).
// ---------------------------------------------------------------------------
const KEY_PAIRS = [
  { b: "physical.body_type", a: "body_type" },
  { b: "physical.dress_size", a: "clothing_size" },
  { b: "identity.dob", a: "date_of_birth" },
  { b: "physical.eye_color", a: "eye_color" },
  { b: "physical.hair_color", a: "hair_color" },
  { b: "physical.hair_length", a: "hair_length" },
  { b: "physical.height_cm", a: "height_cm" },
  { b: "physical.shoe_size_eu", a: "shoe_size" },
  { b: "experience.years_total", a: "years_experience" },
  { b: "experience.level", a: "experience_level" },
  { b: "experience.notable_work", a: "notable_work" },
  { b: "experience.professional_highlights", a: "professional_highlights" },
  { b: "availability.status", a: "availability_status" },
  { b: "availability.available_for", a: "available_for" },
  { b: "travel.willing", a: "willing_to_travel" },
  { b: "travel.scope", a: "travel_scope" },
  { b: "media.website_url", a: "website_url" },
  // Not in the bridge map, but required for the height/gender directory-bug proof:
  { b: "identity.gender", a: "gender" },
];

// The two directory-filter-bug fields that ALSO get an indexed-column three-way
// coverage report (T1.1 before/after). Each maps to a column on talent_profiles.
const THREE_WAY = [
  { b: "physical.height_cm", a: "height_cm", col: "height_cm" },
  { b: "identity.gender", a: "gender", col: "gender" },
];

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (name, def) => {
  const hit = args.find((x) => x.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const COHORT_ARG = argVal("cohort", "both"); // all | public-approved | both
const SAMPLES = Math.max(0, Number(argVal("samples", "5")) || 5);
const AS_JSON = args.includes("--json");

const COHORTS =
  COHORT_ARG === "both" ? ["all", "public-approved"] : [COHORT_ARG];
for (const c of COHORTS) {
  if (c !== "all" && c !== "public-approved") {
    console.error(`[parity] unknown cohort "${c}" (use all | public-approved | both)`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// DB plumbing — verbatim runSql POST helper (apply-migration.mjs style)
// ---------------------------------------------------------------------------
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!TOKEN || !SUPABASE_URL) {
  console.error(
    "[parity] missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL.\n" +
      "Run with --env-file=.env.local --env-file=.env.vercel.local",
  );
  process.exit(1);
}
const REF = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!REF) {
  console.error("[parity] could not parse project ref from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function runSql(sql) {
  const res = await fetch(SQL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok || (body && body.message)) {
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

// SQL string literal escaper (single-quote double). Defensive — all our keys
// are static config, but keep the harness reusable for caller-supplied keys.
const lit = (s) => `'${String(s).replace(/'/gu, "''")}'`;
const arr = (xs) => `ARRAY[${xs.map(lit).join(",")}]`;

// ---------------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------------
//
// Cohort predicate. The "public-approved" cohort reuses EXACTLY the directory's
// own runtime visibility predicate from fetch-directory-page.ts:
//     deleted_at IS NULL AND is_publicly_hidden = false
// i.e. the directory-relevant set the audit counted (~89). "all" is every
// talent that has a value in either store for the key-set under test.
//
// `cohortCte(name)` materializes the eligible talent_profile_id set.
function cohortCte(cohort) {
  if (cohort === "public-approved") {
    return `
  cohort AS (
    SELECT id AS talent_profile_id
    FROM public.talent_profiles
    WHERE deleted_at IS NULL AND is_publicly_hidden = false
  )`;
  }
  // "all": union of every talent that has a value in either store for any of the
  // key-set definition ids (computed below as a_all / b_all). For "all" we let
  // the per-key FULL OUTER JOIN define presence and skip a cohort gate.
  return null;
}

// Normalization expression — applied to a text value to make slug↔label
// (case / hyphen / underscore / spacing differences) compare equal, WITHOUT
// importing the TS coercion. Light + deterministic:
//   lower → trim → collapse [-_/ ]+ runs and whitespace to single space → trim.
// e.g. 'Light Brown' == 'light_brown' == 'light-brown'.
function norm(expr) {
  return `nullif(btrim(regexp_replace(lower(btrim(${expr})), '[-_/[:space:]]+', ' ', 'g')), '')`;
}

// Collapse System A's typed columns into one comparable text value.
const A_VALUE = `coalesce(av.value_text, av.value_number::text, av.value_boolean::text, av.value_date::text)`;
// Extract System B's scalar from the jsonb `value` (json string/number/bool →
// text). `#>>'{}'` yields the scalar text for primitives (and the json text for
// arrays/objects, which these bridged keys never are).
const B_VALUE = `(bv.value #>> '{}')`;

// ---------------------------------------------------------------------------
// Main per-cohort consolidated query.
//
// ONE round-trip computes the entire agreement table for all key pairs:
//   - adefs/bdefs: resolve the definition ids for each key (A may have MULTIPLE
//     ids per key — experience_level does — so we keep ALL of them per key and
//     join on field_definition_id = ANY(ids); a talent row is unique on
//     (talent_profile_id, field_definition_id) so no double-count).
//   - aval/bval: collapse to (talent_profile_id, key, value) per store, gated
//     to the cohort.
//   - j: FULL OUTER JOIN aval ⟕⟖ bval on (talent_profile_id, key).
//   - final GROUP BY key aggregates totals, both-present, raw + normalized
//     agreement, A-only / B-only, and a small sample of disagreeing rows.
// ---------------------------------------------------------------------------
function buildAgreementSql(cohort, sampleN) {
  const bKeys = KEY_PAIRS.map((p) => p.b);
  const aKeys = KEY_PAIRS.map((p) => p.a);
  // pair map (a_key → b_key) as a VALUES list so we can label both stores by the
  // canonical (b) key and join them on a common key axis.
  const pairValues = KEY_PAIRS.map((p) => `(${lit(p.b)}, ${lit(p.a)})`).join(",\n      ");

  const cohortDef = cohortCte(cohort);
  const cohortGateA = cohort === "public-approved" ? "JOIN cohort c ON c.talent_profile_id = fv.talent_profile_id" : "";
  const cohortGateB = cohort === "public-approved" ? "JOIN cohort c ON c.talent_profile_id = bv.talent_profile_id" : "";

  return `
WITH
  pairs(b_key, a_key) AS (
    VALUES
      ${pairValues}
  ),${cohortDef ? cohortDef + "," : ""}
  -- System A definition ids per legacy key (KEEP duplicates; aggregate all).
  adefs AS (
    SELECT key AS a_key, array_agg(id) AS ids
    FROM public.field_definitions
    WHERE key = ANY (${arr(aKeys)})
    GROUP BY key
  ),
  -- System B definition ids per canonical key.
  bdefs AS (
    SELECT field_key AS b_key, array_agg(id) AS ids
    FROM public.profile_field_definitions
    WHERE field_key = ANY (${arr(bKeys)})
    GROUP BY field_key
  ),
  -- One A value per (talent, canonical key). value_text/number/boolean/date
  -- collapsed to text. If a talent somehow had >1 A def-id populated for a key
  -- (not observed) we take the first deterministically.
  aval AS (
    SELECT p.b_key AS b_key, av.talent_profile_id,
           (array_agg(${A_VALUE} ORDER BY av.field_definition_id))[1] AS a_raw
    FROM public.field_values av
    JOIN pairs p ON true
    JOIN adefs ad ON ad.a_key = p.a_key AND av.field_definition_id = ANY (ad.ids)
    ${cohort === "public-approved" ? "JOIN cohort c ON c.talent_profile_id = av.talent_profile_id" : ""}
    WHERE ${A_VALUE} IS NOT NULL
    GROUP BY p.b_key, av.talent_profile_id
  ),
  -- One B value per (talent, canonical key). jsonb scalar → text.
  bval AS (
    SELECT p.b_key AS b_key, bv.talent_profile_id,
           (array_agg(${B_VALUE} ORDER BY bv.field_definition_id))[1] AS b_raw
    FROM public.talent_profile_field_values bv
    JOIN pairs p ON true
    JOIN bdefs bd ON bd.b_key = p.b_key AND bv.field_definition_id = ANY (bd.ids)
    ${cohort === "public-approved" ? "JOIN cohort c ON c.talent_profile_id = bv.talent_profile_id" : ""}
    WHERE ${B_VALUE} IS NOT NULL
    GROUP BY p.b_key, bv.talent_profile_id
  ),
  j AS (
    SELECT
      coalesce(a.b_key, b.b_key) AS b_key,
      coalesce(a.talent_profile_id, b.talent_profile_id) AS talent_profile_id,
      a.a_raw, b.b_raw,
      (a.a_raw IS NOT NULL) AS in_a,
      (b.b_raw IS NOT NULL) AS in_b,
      (a.a_raw IS NOT NULL AND b.b_raw IS NOT NULL) AS both,
      (a.a_raw IS NOT NULL AND b.b_raw IS NOT NULL AND a.a_raw = b.b_raw) AS agree_raw,
      (a.a_raw IS NOT NULL AND b.b_raw IS NOT NULL
        AND ${norm("a.a_raw")} IS NOT DISTINCT FROM ${norm("b.b_raw")}) AS agree_norm
    FROM aval a
    FULL OUTER JOIN bval b
      ON a.b_key = b.b_key AND a.talent_profile_id = b.talent_profile_id
  )
SELECT
  pr.b_key, pr.a_key,
  count(*) FILTER (WHERE j.in_a)                              AS a_total,
  count(*) FILTER (WHERE j.in_b)                              AS b_total,
  count(*) FILTER (WHERE j.both)                              AS both_present,
  count(*) FILTER (WHERE j.agree_norm)                        AS agree_norm,
  count(*) FILTER (WHERE j.agree_raw)                         AS agree_raw,
  count(*) FILTER (WHERE j.in_a AND NOT j.in_b)               AS a_only,
  count(*) FILTER (WHERE j.in_b AND NOT j.in_a)               AS b_only,
  -- up to ${sampleN} sample diffs (both present, NOT normalized-agree)
  (
    SELECT coalesce(jsonb_agg(s ORDER BY s->>'t'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('t', d.talent_profile_id::text, 'a', d.a_raw, 'b', d.b_raw) AS s
      FROM j d
      WHERE d.b_key = pr.b_key AND d.both AND NOT d.agree_norm
      ORDER BY d.talent_profile_id
      LIMIT ${sampleN}
    ) ss
  ) AS sample_diffs
FROM pairs pr
LEFT JOIN j ON j.b_key = pr.b_key
GROUP BY pr.b_key, pr.a_key
ORDER BY pr.b_key;`;
}

// ---------------------------------------------------------------------------
// Three-way coverage query (height + gender) — how many cohort talents carry a
// value in (1) the indexed talent_profiles column, (2) System A field_values,
// (3) System B talent_profile_field_values. This is the directory-bug evidence:
// the directory reads the indexed column; the value store has more.
// ---------------------------------------------------------------------------
function buildThreeWaySql(cohort) {
  const bKeys = THREE_WAY.map((t) => t.b);
  const aKeys = THREE_WAY.map((t) => t.a);
  const where =
    cohort === "public-approved"
      ? "tp.deleted_at IS NULL AND tp.is_publicly_hidden = false"
      : "true";
  // cohort size for context
  const cohortSize = `(SELECT count(*) FROM public.talent_profiles tp WHERE ${where})`;

  const lines = THREE_WAY.map((t) => {
    const colExpr =
      t.col === "height_cm"
        ? "tp.height_cm IS NOT NULL"
        : "nullif(btrim(tp.gender), '') IS NOT NULL";
    return `
  SELECT
    ${lit(t.b)} AS b_key,
    ${lit(t.col)} AS indexed_col,
    (SELECT count(*) FROM public.talent_profiles tp WHERE ${where} AND ${colExpr}) AS in_indexed_col,
    (SELECT count(DISTINCT av.talent_profile_id)
       FROM public.field_values av
       JOIN public.field_definitions ad ON ad.id = av.field_definition_id AND ad.key = ${lit(t.a)}
       JOIN public.talent_profiles tp ON tp.id = av.talent_profile_id
       WHERE ${where} AND coalesce(av.value_text, av.value_number::text, av.value_boolean::text, av.value_date::text) IS NOT NULL
    ) AS in_system_a,
    (SELECT count(DISTINCT bv.talent_profile_id)
       FROM public.talent_profile_field_values bv
       JOIN public.profile_field_definitions bd ON bd.id = bv.field_definition_id AND bd.field_key = ${lit(t.b)}
       JOIN public.talent_profiles tp ON tp.id = bv.talent_profile_id
       WHERE ${where} AND (bv.value #>> '{}') IS NOT NULL
    ) AS in_system_b,
    ${cohortSize} AS cohort_size`;
  });

  // referencing aKeys/bKeys to keep them used (defensive: validates the THREE_WAY
  // keys exist in the same key-set the agreement table covers).
  void aKeys;
  void bKeys;
  return lines.join("\n  UNION ALL\n");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const pct = (num, den) => (den > 0 ? ((num / den) * 100).toFixed(1) + "%" : "—");
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

function renderAgreementTable(cohort, rows) {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`COHORT: ${cohort}  —  A-read vs B-read agreement (per canonical key)`);
  console.log("=".repeat(78));
  console.log(
    pad("B key", 36) +
      padL("A#", 5) +
      padL("B#", 5) +
      padL("both", 6) +
      padL("agree", 7) +
      padL("norm%", 8) +
      padL("raw%", 7) +
      padL("Aonly", 7) +
      padL("Bonly", 7),
  );
  console.log("-".repeat(78));

  let tA = 0,
    tB = 0,
    tBoth = 0,
    tNorm = 0,
    tRaw = 0,
    tAonly = 0,
    tBonly = 0;
  const driftKeys = [];

  for (const r of rows) {
    const a = Number(r.a_total),
      b = Number(r.b_total),
      both = Number(r.both_present),
      norm = Number(r.agree_norm),
      raw = Number(r.agree_raw),
      aOnly = Number(r.a_only),
      bOnly = Number(r.b_only);
    tA += a;
    tB += b;
    tBoth += both;
    tNorm += norm;
    tRaw += raw;
    tAonly += aOnly;
    tBonly += bOnly;
    if (both - norm > 0) driftKeys.push({ key: r.b_key, drift: both - norm });

    console.log(
      pad(r.b_key, 36) +
        padL(a, 5) +
        padL(b, 5) +
        padL(both, 6) +
        padL(norm, 7) +
        padL(pct(norm, both), 8) +
        padL(pct(raw, both), 7) +
        padL(aOnly, 7) +
        padL(bOnly, 7),
    );
  }
  console.log("-".repeat(78));
  console.log(
    pad("OVERALL", 36) +
      padL(tA, 5) +
      padL(tB, 5) +
      padL(tBoth, 6) +
      padL(tNorm, 7) +
      padL(pct(tNorm, tBoth), 8) +
      padL(pct(tRaw, tBoth), 7) +
      padL(tAonly, 7) +
      padL(tBonly, 7),
  );

  console.log(
    "\nLegend: A#/B# = talents with a value in that store; both = both present; " +
      "agree = both & normalized-equal;\n  norm% = normalized agreement of both-present; " +
      "raw% = byte-equal agreement of both-present;\n  Aonly = in A not B (a repoint A→B would LOSE these); Bonly = in B not A.",
  );

  // True value drift = both present but NOT normalized-equal (vocab differences
  // already collapsed). Surface samples so we can eyeball real divergence.
  const trueDrift = rows.filter((r) => Number(r.both_present) - Number(r.agree_norm) > 0);
  if (trueDrift.length) {
    console.log(`\nTRUE VALUE DRIFT (both present, normalized-unequal) — ${cohort}:`);
    for (const r of trueDrift) {
      const n = Number(r.both_present) - Number(r.agree_norm);
      console.log(`  ${r.b_key}: ${n} talent(s) disagree after normalization`);
      const samples = Array.isArray(r.sample_diffs) ? r.sample_diffs : [];
      for (const s of samples.slice(0, SAMPLES)) {
        console.log(`      ${s.t}  A=${JSON.stringify(s.a)}  B=${JSON.stringify(s.b)}`);
      }
    }
  } else {
    console.log(`\nNo TRUE value drift in cohort "${cohort}" — all both-present rows agree after normalization.`);
  }

  // Vocab-only drift = raw-unequal but normalized-equal (expected: A=slug, B=label).
  const vocabOnly = tNorm - tRaw;
  if (vocabOnly > 0) {
    console.log(
      `\nVocab-only drift (raw-unequal but normalized-equal): ${vocabOnly} both-present rows ` +
        `(expected — System A stores slugs, System B stores labels).`,
    );
  }
}

function renderThreeWay(cohort, rows) {
  console.log(`\n${"-".repeat(78)}`);
  console.log(`THREE-WAY COVERAGE (directory-filter bug fields) — cohort: ${cohort}`);
  console.log("-".repeat(78));
  const size = rows[0] ? Number(rows[0].cohort_size) : 0;
  console.log(`Cohort size (talent_profiles in cohort): ${size}`);
  console.log(
    pad("B key", 22) +
      pad("indexed col", 14) +
      padL("indexed", 9) +
      padL("SystemA", 9) +
      padL("SystemB", 9),
  );
  for (const r of rows) {
    console.log(
      pad(r.b_key, 22) +
        pad(`tp.${r.indexed_col}`, 14) +
        padL(`${r.in_indexed_col}`, 9) +
        padL(`${r.in_system_a}`, 9) +
        padL(`${r.in_system_b}`, 9),
    );
  }
  console.log(
    "\nThe directory filter reads the INDEXED column; the value stores hold more. " +
      "A large\n(SystemB − indexed) gap is the live bug T1.1 fixes (filter returns ~0 vs the real set).",
  );
}

// ---------------------------------------------------------------------------
// Run — STRICTLY SEQUENTIAL. Per cohort: 1 agreement query + 1 three-way query.
// ---------------------------------------------------------------------------
async function main() {
  const out = { ref: REF, generatedAt: new Date().toISOString(), cohorts: {} };
  console.log(`[parity] project ref ${REF} — READ-ONLY — ${KEY_PAIRS.length} key pairs`);
  console.log(`[parity] cohorts: ${COHORTS.join(", ")} | samples: ${SAMPLES}`);

  for (const cohort of COHORTS) {
    // Query 1: full agreement table for this cohort.
    const agreeRows = await runSql(buildAgreementSql(cohort, SAMPLES));
    // Query 2: three-way coverage for height + gender.
    const threeRows = await runSql(buildThreeWaySql(cohort));

    out.cohorts[cohort] = { agreement: agreeRows, threeWay: threeRows };
    if (!AS_JSON) {
      renderAgreementTable(cohort, agreeRows);
      renderThreeWay(cohort, threeRows);
    }
  }

  if (AS_JSON) console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("[parity] FAILED:", e.message);
  process.exit(1);
});
