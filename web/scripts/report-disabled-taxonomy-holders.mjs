#!/usr/bin/env node
/**
 * TUL-443 — READ-ONLY report: talents who still hold taxonomy terms their
 * workspace has switched off (agency_taxonomy_settings.is_enabled = false).
 *
 * Never writes: only `.select()` calls exist in this file. The cleanup lives in
 * the unapplied migration 20261231400200_hold_cleanup_disabled_taxonomy.sql and
 * in clear-disabled-taxonomy-holders.mjs (guarded --apply --yes).
 *
 * Usage (from web/):
 *   node --env-file=.env.local scripts/report-disabled-taxonomy-holders.mjs [--tenant impronta]
 *
 * Stranded talents (no other enabled term) also show the proposed nearest active
 * type from the TUL-443 migration mapping (20261231431100, held in _pending_pm).
 * The last lines count stranded rows with / without a mapping.
 *
 * Output per holder: profile code, name, the switched-off term, whether the
 * talent also holds an ENABLED term of the same kind (safe to drop the orphan)
 * or has nothing else (needs a migrate target decision).
 * Exit code is 1 when any holdover exists (usable as a smoke check).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Single source for the nearest-active mapping: the held migration's VALUES list.
const MIGRATION = new URL(
  "../../supabase/migrations/_pending_pm/20261231431100_migrate_stranded_disabled_taxonomy_holders_tul443.sql",
  import.meta.url,
);
const mapping = new Map(); // old slug -> { to, confidence }
for (const m of readFileSync(MIGRATION, "utf8").matchAll(
  /^\s+\('([a-z0-9-]+)','([a-z0-9-]+)','(exact|close|category)'/gm,
)) {
  mapping.set(m[1], { to: m[2], confidence: m[3] });
}

const args = process.argv.slice(2);
const ti = args.indexOf("--tenant");
const tenantSlug = ti >= 0 ? args[ti + 1] : null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

let agencyQ = sb.from("agencies").select("id, slug");
if (tenantSlug) agencyQ = agencyQ.eq("slug", tenantSlug);
const { data: agencies, error: aErr } = await agencyQ;
if (aErr) { console.error(aErr.message); process.exit(2); }

let total = 0;
let strandedMapped = 0;
let strandedUnmapped = 0;
for (const agency of agencies ?? []) {
  const { data: off } = await sb
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id")
    .eq("tenant_id", agency.id)
    .eq("is_enabled", false);
  const offIds = (off ?? []).map((r) => r.taxonomy_term_id);
  if (offIds.length === 0) continue;

  const { data: terms } = await sb.from("taxonomy_terms").select("id, slug, kind").in("id", offIds);
  const termById = new Map((terms ?? []).map((t) => [t.id, t]));

  const { data: roster } = await sb
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", agency.id)
    .eq("status", "active");
  const rosterIds = (roster ?? []).map((r) => r.talent_profile_id);
  if (rosterIds.length === 0) continue;

  const { data: held } = await sb
    .from("talent_profile_taxonomy")
    .select("talent_profile_id, taxonomy_term_id, tenant_id, is_primary")
    .in("taxonomy_term_id", offIds)
    .in("talent_profile_id", rosterIds);
  const rows = (held ?? []).filter((r) => r.tenant_id === agency.id || r.tenant_id == null);
  if (rows.length === 0) continue;

  const ids = [...new Set(rows.map((r) => r.talent_profile_id))];
  const { data: profiles } = await sb.from("talent_profiles").select("id, profile_code, display_name").in("id", ids);
  const pById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const { data: allHeld } = await sb
    .from("talent_profile_taxonomy")
    .select("talent_profile_id, taxonomy_term_id")
    .in("talent_profile_id", ids);
  const offSet = new Set(offIds);
  const targetSlugs = [...new Set([...mapping.values()].map((v) => v.to))];
  const { data: targets } = await sb.from("taxonomy_terms").select("id, slug, archived_at").in("slug", targetSlugs);
  const targetBySlug = new Map((targets ?? []).filter((t) => !t.archived_at).map((t) => [t.slug, t]));

  console.log(`\nTenant ${agency.slug}: ${rows.length} holdover row(s)`);
  for (const r of rows) {
    const t = termById.get(r.taxonomy_term_id);
    const others = (allHeld ?? []).filter(
      (h) => h.talent_profile_id === r.talent_profile_id && !offSet.has(h.taxonomy_term_id),
    ).length;
    const p = pById.get(r.talent_profile_id);
    let verdict;
    if (others > 0) {
      verdict = `${others} other enabled term(s): orphan can be dropped`;
    } else {
      const m = mapping.get(t?.slug);
      const target = m ? targetBySlug.get(m.to) : null;
      const active = target && !offSet.has(target.id);
      if (active) {
        strandedMapped += 1;
        verdict = `STRANDED -> proposed ${m.to} (${m.confidence})`;
      } else {
        strandedUnmapped += 1;
        verdict = "STRANDED -> NO mapping, needs a decision";
      }
    }
    console.log(
      `  ${p?.profile_code ?? r.talent_profile_id} (${p?.display_name ?? "?"}) holds ${t?.slug} [${t?.kind}]` +
        `${r.is_primary ? " primary" : ""} -> ${verdict}`,
    );
  }
  total += rows.length;
}
console.log(`\nTotal holdover rows: ${total}`);
console.log(`Stranded rows with a proposed target: ${strandedMapped}; stranded rows with no mapping: ${strandedUnmapped}`);
process.exit(total > 0 ? 1 : 0);
