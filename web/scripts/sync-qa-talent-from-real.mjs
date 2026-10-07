#!/usr/bin/env node
// ============================================================================
// sync-qa-talent-from-real.mjs  (TUL-135)
// ============================================================================
// Compares the REAL talent (TAL-93938, Jorgelina, READ-ONLY) with the QA twin
// (TAL-93900) and, with --apply, copies the source values onto the twin only.
//
//   node scripts/sync-qa-talent-from-real.mjs            # dry-run (SELECT only)
//   node scripts/sync-qa-talent-from-real.mjs --apply    # writes TAL-93900 rows
//   --exclude bookingPosture,inPersonMethods,qaOfferings  # skip those (comma list)
//   --auto   # nightly mode; default exclusions: bookingPosture,inPersonMethods
//
// Never copied: bookings, inquiries, clients, messages, payments, media files.
// Profile-owned media references are listed, not copied. Extra QA offerings
// are reported and left alone.
//
// DB access: Supabase Management API SQL endpoint (same auth as
// apply-migration.mjs): SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL from
// web/.env.local.

import { loadEnvLocal } from "./load-env-local.mjs";
import {
  SOURCE_CODE,
  TARGET_CODE,
  assertSelectOnly,
  assertOwnedWrites,
  buildDiff,
  parseExclusions,
  formatReport,
  planWrites,
  writeToSql,
} from "./lib/sync-qa-talent.mjs";

loadEnvLocal();
const APPLY = process.argv.includes("--apply");
const EXCLUDE = parseExclusions(process.argv);
const HUB_TENANT_PREFIX = "40081ec3";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!TOKEN || !SUPABASE_URL) {
  console.error("[sync-qa-talent] missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL (web/.env.local).");
  process.exit(1);
}
const REF = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!REF) {
  console.error("[sync-qa-talent] could not parse project ref from NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function post(query) {
  const res = await fetch(SQL_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok || (body && body.message)) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}
const select = (sql) => post(assertSelectOnly(sql));

async function loadTalent(code) {
  const [profile] = await select(`SELECT * FROM public.talent_profiles WHERE profile_code = '${code}' AND deleted_at IS NULL`);
  if (!profile) throw new Error(`talent ${code} not found`);
  const id = profile.id;
  const taxonomy = await select(
    `SELECT t.taxonomy_term_id, tt.kind, tt.slug, t.is_primary, t.relationship_type, t.display_order, t.tenant_id
       FROM public.talent_profile_taxonomy t JOIN public.taxonomy_terms tt ON tt.id = t.taxonomy_term_id
      WHERE t.talent_profile_id = '${id}' ORDER BY tt.kind, tt.slug`,
  );
  const offerings = await select(`SELECT * FROM public.talent_offerings WHERE talent_profile_id = '${id}' ORDER BY sort_order, title`);
  const [hours] = await select(`SELECT * FROM public.talent_booking_hours WHERE talent_profile_id = '${id}'`);
  const [site] = await select(`SELECT * FROM public.talent_sites WHERE talent_profile_id = '${id}'`);
  return { profile, taxonomy, offerings, hours: hours ?? null, site: site ?? null };
}

const source = await loadTalent(SOURCE_CODE);
const target = await loadTalent(TARGET_CODE);
const sourceProfileId = source.profile.id;
const targetProfileId = target.profile.id;
// Hard stop: the only talent this script may ever write is the QA twin.
if (TARGET_CODE !== "TAL-93900" || target.profile.profile_code !== "TAL-93900") {
  throw new Error(`refusing: target must be exactly TAL-93900, got ${target.profile.profile_code}`);
}

for (const [label, t] of [["source", source], ["target", target]]) {
  const tenant = t.hours?.tenant_id ?? t.profile.created_by_agency_id ?? "";
  if (!String(tenant).startsWith(HUB_TENANT_PREFIX)) console.warn(`[warn] ${label} tenant is ${tenant || "unknown"}, expected ${HUB_TENANT_PREFIX}…`);
}

const diff = buildDiff({ source, target, exclude: EXCLUDE });
console.log(`TUL-135 sync ${SOURCE_CODE} (source, read-only) -> ${TARGET_CODE} (target) [${APPLY ? "APPLY" : "DRY-RUN"}]`);
if (EXCLUDE.size) console.log(`excluded: ${[...EXCLUDE].join(", ")}`);
console.log(`source profile ${sourceProfileId}   target profile ${targetProfileId}`);
console.log(formatReport(diff));
console.log("\nSummary (differences per area; 'writable' = would be written by --apply):");
for (const [area, c] of Object.entries(diff.counts)) console.log(`  ${area.padEnd(14)} ${String(c.total).padStart(3)} total, ${String(c.writable).padStart(3)} writable`);
if (!Object.keys(diff.counts).length) console.log("  none: target already matches source");

const writes = planWrites({ source, target, diff, targetProfileId, sourceProfileId, exclude: EXCLUDE });
console.log(`\n${writes.length} guarded write(s) planned, all scoped to ${TARGET_CODE}.`);

if (!APPLY) {
  console.log("Dry-run only: nothing was written. Re-run with --apply to copy source values onto the target.");
  process.exit(0);
}

assertOwnedWrites(writes, { targetProfileId, sourceProfileId });
if (writes.length) {
  await post(`BEGIN;\n${writes.map(writeToSql).join("\n")}\nCOMMIT;`);
  console.log(`Applied ${writes.length} write(s) to ${TARGET_CODE}.`);
} else console.log("Nothing to apply.");
