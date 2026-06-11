/**
 * backfill-a-to-b-bridged-keys.ts — T1.2a one-shot A→B superset backfill.
 *
 * Makes System B (`talent_profile_field_values`) the SUPERSET of System A
 * (`field_values`) for the 17 bridged keys, so the upcoming Phase-2 reader
 * repoint (A→B) cannot silently DROP any value. Today ~326 rows are present
 * in System A but absent from System B ("A-only"); this fills them.
 *
 * VALUE SAFETY — reuses the EXACT live write path. For each A-only
 * (talent, legacy key, A typed-value) it calls `mirrorWriteToCanonical`
 * (src/lib/fields/legacy-mirror) which:
 *   (a) resolves the B def id by field_key,
 *   (b) translates the incoming A slug → B's option LABEL via
 *       `matchLabelOption` against profile_field_definitions.options
 *       (System A stores slugs, System B stores labels — this is the ONLY
 *       divergence; the parity harness proved zero true value drift),
 *   (c) resolves tenant_id from the talent's first active roster row,
 *   (d) upserts into talent_profile_field_values with
 *       workflow_state='live', last_edited_role='platform'.
 * The upsert is onConflict (talent_profile_id, field_definition_id), so this
 * only fills gaps and is fully idempotent / re-runnable.
 *
 * A-ONLY DISCOVERY — a single READ-ONLY consolidated query against the
 * Supabase Management-API SQL endpoint (same plumbing as the parity harness),
 * using the SAME def-id resolution: System A may have DUPLICATE def-ids per
 * key (experience_level has 2) — we UNION all of them. A row is "A-only" iff
 * the talent has a non-null collapsed A value for the key AND no
 * talent_profile_field_values row for the corresponding B def id.
 *
 * identity.dob IS in the bridge (date_of_birth → identity.dob) and its A→B
 * direction matches the existing mirror (field_values.value_date is the source
 * the mirror already uses) — its ~2 A-only rows are backfilled too. We do NOT
 * read the talent_profiles.dob COLUMN (the corrupting direction the project
 * forbids); we go A field_values → B only.
 *
 * Run from web/:
 *   node --env-file=.env.local --env-file=.env.vercel.local \
 *     -r tsx/cjs scripts/backfill-a-to-b-bridged-keys.ts --dry-run   # enumerate, no writes
 *   node --env-file=.env.local --env-file=.env.vercel.local \
 *     -r tsx/cjs scripts/backfill-a-to-b-bridged-keys.ts             # apply
 *
 * SAFETY: localhost dev points at PROD Supabase (small shared compute). This
 * runs as ONE bounded sequential pass — no concurrent write fan-out.
 */
import { createClient } from "@supabase/supabase-js";
import {
  NEW_TO_OLD_KEY,
  OLD_TO_NEW_KEY,
  mirrorWriteToCanonical,
} from "../src/lib/fields/legacy-mirror";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!url || !svcKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)",
  );
  process.exit(1);
}
if (!accessToken) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN (web/.env.vercel.local) — needed for the read-only A-only enumeration query.",
  );
  process.exit(1);
}

const DRY = process.argv.includes("--dry-run");
const svc = createClient(url, svcKey, { auth: { persistSession: false } });

const REF = url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!REF) {
  console.error("Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

// Read-only Management-API SQL helper (verbatim parity-harness style).
async function runSql<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await fetch(SQL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = (await res.json()) as unknown;
  if (!res.ok || (body && typeof body === "object" && "message" in body)) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T[];
}

const lit = (s: string) => `'${String(s).replace(/'/gu, "''")}'`;
const arr = (xs: string[]) => `ARRAY[${xs.map(lit).join(",")}]`;

// Collapse System A's typed columns to one comparable text value — IDENTICAL
// to the parity harness's A_VALUE. This is the exact `aValue` we feed to the
// mirror (text ?? number ?? boolean ?? date), coerced to text.
const A_VALUE = `coalesce(av.value_text, av.value_number::text, av.value_boolean::text, av.value_date::text)`;

type AOnlyRow = {
  b_key: string;
  a_key: string;
  talent_profile_id: string;
  a_raw: string;
};

/**
 * One consolidated READ-ONLY query returning every A-only row across all 17
 * bridged keys. A-only = the talent has a non-null collapsed A value for the
 * key (union of ALL A def-ids per key) and NO talent_profile_field_values row
 * for the corresponding B def id (union of all B def-ids per key — there is
 * only one in practice, but we keep the ANY() form symmetric/defensive).
 */
function buildAOnlySql(): string {
  const pairs = Object.entries(NEW_TO_OLD_KEY); // [bKey, aKey]
  const bKeys = pairs.map(([b]) => b);
  const aKeys = pairs.map(([, a]) => a);
  const pairValues = pairs.map(([b, a]) => `(${lit(b)}, ${lit(a)})`).join(",\n      ");

  return `
WITH
  pairs(b_key, a_key) AS (
    VALUES
      ${pairValues}
  ),
  adefs AS (
    SELECT key AS a_key, array_agg(id) AS ids
    FROM public.field_definitions
    WHERE key = ANY (${arr(aKeys)})
    GROUP BY key
  ),
  bdefs AS (
    SELECT field_key AS b_key, array_agg(id) AS ids
    FROM public.profile_field_definitions
    WHERE field_key = ANY (${arr(bKeys)})
    GROUP BY field_key
  ),
  -- One A value per (talent, canonical key): collapse typed cols, take the
  -- first deterministically if a talent somehow had >1 A def populated.
  aval AS (
    SELECT p.b_key, p.a_key, av.talent_profile_id,
           (array_agg(${A_VALUE} ORDER BY av.field_definition_id))[1] AS a_raw
    FROM public.field_values av
    JOIN pairs p ON true
    JOIN adefs ad ON ad.a_key = p.a_key AND av.field_definition_id = ANY (ad.ids)
    WHERE ${A_VALUE} IS NOT NULL
    GROUP BY p.b_key, p.a_key, av.talent_profile_id
  ),
  -- Presence in B per (talent, canonical key).
  bpresent AS (
    SELECT DISTINCT p.b_key, bv.talent_profile_id
    FROM public.talent_profile_field_values bv
    JOIN pairs p ON true
    JOIN bdefs bd ON bd.b_key = p.b_key AND bv.field_definition_id = ANY (bd.ids)
    WHERE (bv.value #>> '{}') IS NOT NULL
  )
SELECT a.b_key, a.a_key, a.talent_profile_id::text AS talent_profile_id, a.a_raw
FROM aval a
LEFT JOIN bpresent b
  ON b.b_key = a.b_key AND b.talent_profile_id = a.talent_profile_id
WHERE b.talent_profile_id IS NULL
ORDER BY a.b_key, a.talent_profile_id;`;
}

async function main(): Promise<void> {
  console.log(
    `[T1.2a A→B backfill] ${DRY ? "DRY-RUN — no writes. " : ""}ref=${REF} bridged keys=${Object.keys(NEW_TO_OLD_KEY).length}`,
  );

  // 1. Enumerate every A-only row (read-only, one round-trip).
  const aOnly = await runSql<AOnlyRow>(buildAOnlySql());
  console.log(`[enumerate] A-only rows found: ${aOnly.length}`);

  // Per-key tally for the work-list.
  const perKey = new Map<string, number>();
  for (const r of aOnly) perKey.set(r.b_key, (perKey.get(r.b_key) ?? 0) + 1);
  for (const [bKey, n] of [...perKey.entries()].sort()) {
    console.log(`   ${bKey} (${NEW_TO_OLD_KEY[bKey]}): ${n}`);
  }

  if (aOnly.length === 0) {
    console.log("\n[T1.2a] nothing to backfill — System B already a superset.");
    return;
  }

  // 2. Backfill each A-only row via the proven live mirror. Sequential — no
  //    concurrent write fan-out (PROD shared compute).
  let written = 0;
  let failed = 0;
  const samples: Array<{ b_key: string; talent: string; aRaw: string }> = [];

  for (const r of aOnly) {
    const legacyKey = r.a_key; // mirrorWriteToCanonical keys off the LEGACY key
    if (!OLD_TO_NEW_KEY[legacyKey]) {
      // Not in the 17-key bridge — should never happen (query is scoped to it).
      continue;
    }
    if (DRY) {
      if (samples.length < 30) {
        samples.push({ b_key: r.b_key, talent: r.talent_profile_id, aRaw: r.a_raw });
      }
      written++;
      continue;
    }
    try {
      await mirrorWriteToCanonical(svc, legacyKey, r.talent_profile_id, r.a_raw);
      written++;
    } catch (e) {
      failed++;
      console.error(
        `   [err] ${r.b_key} talent=${r.talent_profile_id} aRaw=${JSON.stringify(r.a_raw)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (DRY && samples.length) {
    console.log("\n[dry-run] sample A-only rows (b_key | talent | A raw value):");
    for (const s of samples) {
      console.log(`   ${s.b_key.padEnd(36)} ${s.talent}  A=${JSON.stringify(s.aRaw)}`);
    }
  }

  console.log(
    `\n[T1.2a A→B backfill] ${DRY ? "DRY-RUN " : ""}DONE — enumerated=${aOnly.length} ${DRY ? "would-write" : "written"}=${written} failed=${failed}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error("[T1.2a A→B backfill] FATAL:", e);
    process.exit(1);
  });
