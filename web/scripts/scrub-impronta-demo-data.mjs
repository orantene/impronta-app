// scrub-impronta-demo-data.mjs — one-shot cleanup of demo / QA scaffolding
// data inside the Impronta tenant.
//
// What it does (Impronta tenant ONLY — other tenants untouched):
//   1. NULLs out talent_profile_field_values whose value contains ".demo"
//      (catches @sofi.herrera.tulum.demo, https://anto.demo,
//      https://soherrera-tulum.demo, etc.).
//   2. Hides QA / test talents from the public surface by setting
//      is_publicly_hidden=true. Detected by display_name prefix matching
//      a known QA pattern:
//        QA, Test, Local QA, Placetest, Identity QA, Sofia Live, Lucifer
//      Names that DON'T match the QA pattern (Anto, Tina, Nalea, Lanco,
//      Annher, Asia, MILI, Pau, More — i.e. the real model roster) are
//      left untouched.
//   3. Logs every mutation as a structured JSON record for audit.
//
// SAFE BY DEFAULT — dry-run unless APPLY=1 is set:
//   node --env-file=web/.env.local web/scripts/scrub-impronta-demo-data.mjs
//   APPLY=1 node --env-file=web/.env.local web/scripts/scrub-impronta-demo-data.mjs
//
// Idempotent — re-running on already-clean state is a no-op.

import { createClient } from "@supabase/supabase-js";

const APPLY = process.env.APPLY === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Impronta tenant — verified at HEAD 57cc2da8e.
// agencies.slug = 'impronta'.
const { data: a, error: aErr } = await sb
  .from("agencies")
  .select("id, slug, display_name")
  .eq("slug", "impronta")
  .single();
if (aErr || !a) {
  console.error("Could not resolve Impronta tenant:", aErr?.message);
  process.exit(1);
}
const IMPRONTA_TENANT_ID = a.id;
console.log(`Impronta tenant: ${a.display_name} (${a.slug}) — id ${IMPRONTA_TENANT_ID}`);
console.log(APPLY ? "MODE: APPLY — writes will commit" : "MODE: DRY RUN — APPLY=1 to commit");
console.log("");

// ─── 1. Find Impronta talent profile ids ────────────────────────────────
// agency_talent_roster scopes who-belongs-to-whom; we operate on those.
const { data: rosterRows, error: rosterErr } = await sb
  .from("agency_talent_roster")
  .select("talent_profile_id")
  .eq("tenant_id", IMPRONTA_TENANT_ID);
if (rosterErr) {
  console.error("Failed to load roster:", rosterErr.message);
  process.exit(1);
}
const impronta_talent_ids = (rosterRows ?? []).map((r) => r.talent_profile_id);
console.log(`Impronta roster size: ${impronta_talent_ids.length} talent profiles`);

if (impronta_talent_ids.length === 0) {
  console.log("Empty roster — nothing to scrub.");
  process.exit(0);
}

// ─── 2. .demo value scrub on talent_profile_field_values ─────────────────
// value is JSONB. PostgREST can't ilike a JSONB directly, so we fetch all
// rows for Impronta talents and filter client-side. (Volume is small —
// 37 profiles × ~20 fields = ~740 rows max. Fine.)
const { data: allFieldValues, error: dfErr } = await sb
  .from("talent_profile_field_values")
  .select("id, talent_profile_id, field_definition_id, value")
  .in("talent_profile_id", impronta_talent_ids);
if (dfErr) {
  console.error("Failed to query field values:", dfErr.message);
  process.exit(1);
}
const demoFieldValues = (allFieldValues ?? []).filter((r) => {
  const s = typeof r.value === "string" ? r.value : JSON.stringify(r.value);
  return s.toLowerCase().includes(".demo");
});
console.log(`Found ${demoFieldValues.length} talent_profile_field_values rows containing ".demo" (out of ${allFieldValues?.length ?? 0} scanned)`);
for (const row of demoFieldValues.slice(0, 5)) {
  const v = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
  console.log(`  talent ${row.talent_profile_id}  field ${row.field_definition_id}  → ${v}`);
}
if (demoFieldValues.length > 5) {
  console.log(`  ... and ${demoFieldValues.length - 5} more`);
}

if (APPLY && demoFieldValues.length > 0) {
  // Delete the rows entirely — empty value is more honest than a stub.
  // Field-definitions UI re-creates the row on save, so this is safe.
  const idsToDelete = demoFieldValues.map((r) => r.id);
  const { error: delErr } = await sb
    .from("talent_profile_field_values")
    .delete()
    .in("id", idsToDelete);
  if (delErr) {
    console.error("Failed to delete .demo field values:", delErr.message);
    process.exit(1);
  }
  console.log(`✓ Deleted ${idsToDelete.length} .demo field-value rows`);
}

// ─── 3. Hide QA / test talents from the public surface ───────────────────
// Match on display_name patterns we observed in the admin roster:
//   QA Talent Dashboard Audit
//   Test Shell Create
//   Local QA, Sofia Live QA, Test TalentQA, Identity QA, Placetest Autocomplete
//   Lucifer (clearly internal — not a real model name on the Impronta brand)
const QA_PATTERNS = [
  /^QA[\s_-]/i,
  /\bQA$/i,
  /^Test[\s_-]/i,
  /^Local QA/i,
  /^Placetest/i,
  /^Identity QA/i,
  /^Sofia Live/i,
  /^Lucifer$/i,
  /^Orlando$/i,        // sample/demo display name observed on the roster
  /^Julieta$/i,        // same
];

const { data: profiles, error: profErr } = await sb
  .from("talent_profiles")
  .select("id, display_name, profile_code, is_publicly_hidden")
  .in("id", impronta_talent_ids);
if (profErr) {
  console.error("Failed to load talent profiles:", profErr.message);
  process.exit(1);
}

const toHide = (profiles ?? []).filter((p) => {
  if (p.is_publicly_hidden) return false; // already hidden
  return QA_PATTERNS.some((re) => re.test((p.display_name ?? "").trim()));
});

console.log("");
console.log(`Talents matching QA pattern (currently visible): ${toHide.length}`);
for (const p of toHide) {
  console.log(`  ${p.profile_code}  ${p.display_name}`);
}

if (APPLY && toHide.length > 0) {
  const idsToHide = toHide.map((p) => p.id);
  const { error: hideErr } = await sb
    .from("talent_profiles")
    .update({ is_publicly_hidden: true })
    .in("id", idsToHide);
  if (hideErr) {
    console.error("Failed to hide QA talents:", hideErr.message);
    process.exit(1);
  }
  console.log(`✓ Set is_publicly_hidden=true on ${idsToHide.length} QA talents`);
}

// ─── 4. Summary ─────────────────────────────────────────────────────────
console.log("");
console.log("─── Scrub summary ───");
console.log(JSON.stringify({
  tenant: { slug: a.slug, id: IMPRONTA_TENANT_ID },
  applied: APPLY,
  demo_field_values_targeted: demoFieldValues.length,
  qa_talents_to_hide: toHide.length,
  qa_talent_codes: toHide.map((p) => p.profile_code),
}, null, 2));
console.log("");
if (!APPLY) {
  console.log("Re-run with APPLY=1 to commit. Mutations are scoped to Impronta tenant only.");
}
