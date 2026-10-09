#!/usr/bin/env node
/**
 * TUL-443 — clear tenant-scoped talent_profile_taxonomy holdovers for
 * service types the workspace has switched off.
 *
 * Decision: HIDE (not migrate). Deletes only rows for the named tenant.
 * Other tenants' assignments on the same profiles are untouched.
 *
 * Guarded: dry-run by default. PM runs with --apply --yes.
 *
 * Usage (from web/):
 *   node --env-file=.env.local scripts/clear-disabled-taxonomy-holders.mjs \
 *     --tenant impronta
 *
 *   node --env-file=.env.local scripts/clear-disabled-taxonomy-holders.mjs \
 *     --tenant impronta --terms cabaret-act,nightlife-influencer --apply --yes
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const YES = args.includes("--yes");

function flagValue(name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  return args[i + 1] ?? null;
}

const tenantSlug = flagValue("--tenant");
const termsRaw = flagValue("--terms");
const termSlugs = termsRaw
  ? termsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

if (!tenantSlug) {
  console.error("Usage: clear-disabled-taxonomy-holders.mjs --tenant <slug> [--terms a,b] [--apply --yes]");
  process.exit(1);
}

if (APPLY && !YES) {
  console.error("REFUSED: --apply needs --yes (PM-guarded write).");
  process.exit(1);
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });

const { data: agency, error: agencyErr } = await sb
  .from("agencies")
  .select("id, slug")
  .eq("slug", tenantSlug)
  .maybeSingle();
if (agencyErr || !agency) {
  console.error(`Tenant not found: ${tenantSlug}`, agencyErr?.message ?? "");
  process.exit(1);
}

const { data: settings, error: settingsErr } = await sb
  .from("agency_taxonomy_settings")
  .select("taxonomy_term_id, is_enabled")
  .eq("tenant_id", agency.id)
  .eq("is_enabled", false);
if (settingsErr) {
  console.error("Failed to load settings:", settingsErr.message);
  process.exit(1);
}

const disabledIds = (settings ?? []).map((s) => s.taxonomy_term_id);
if (disabledIds.length === 0) {
  console.log(`No switched-off terms for ${tenantSlug}. Nothing to do.`);
  process.exit(0);
}

const { data: terms, error: termsErr } = await sb
  .from("taxonomy_terms")
  .select("id, slug")
  .in("id", disabledIds);
if (termsErr) {
  console.error("Failed to load terms:", termsErr.message);
  process.exit(1);
}

let targetTerms = terms ?? [];
if (termSlugs) {
  const want = new Set(termSlugs);
  targetTerms = targetTerms.filter((t) => want.has(t.slug));
  const found = new Set(targetTerms.map((t) => t.slug));
  for (const s of want) {
    if (!found.has(s)) {
      console.error(`Term "${s}" is not switched off on ${tenantSlug} (or unknown).`);
      process.exit(1);
    }
  }
}

const targetIds = targetTerms.map((t) => t.id);
if (targetIds.length === 0) {
  console.log("No matching switched-off terms. Nothing to do.");
  process.exit(0);
}

const { data: roster, error: rosterErr } = await sb
  .from("agency_talent_roster")
  .select("talent_profile_id")
  .eq("tenant_id", agency.id)
  .eq("status", "active");
if (rosterErr) {
  console.error("Failed to load roster:", rosterErr.message);
  process.exit(1);
}
const rosterIds = (roster ?? []).map((r) => r.talent_profile_id);
if (rosterIds.length === 0) {
  console.log("Empty active roster. Nothing to do.");
  process.exit(0);
}

const { data: assigns, error: assignErr } = await sb
  .from("talent_profile_taxonomy")
  .select("talent_profile_id, taxonomy_term_id, tenant_id, relationship_type, is_primary")
  .in("taxonomy_term_id", targetIds)
  .in("talent_profile_id", rosterIds);
if (assignErr) {
  console.error("Failed to load assignments:", assignErr.message);
  process.exit(1);
}

const rows = (assigns ?? []).filter(
  (a) => a.tenant_id === agency.id || a.tenant_id == null,
);

const { data: profiles } = await sb
  .from("talent_profiles")
  .select("id, profile_code, display_name")
  .in(
    "id",
    rows.length ? [...new Set(rows.map((r) => r.talent_profile_id))] : ["00000000-0000-0000-0000-000000000000"],
  );
const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
const termById = new Map(targetTerms.map((t) => [t.id, t.slug]));

console.log(`\nTenant: ${tenantSlug} (${agency.id})`);
console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`Switched-off terms in scope: ${targetTerms.map((t) => t.slug).join(", ")}`);
console.log(`Holdover rows: ${rows.length}`);

for (const row of rows) {
  const p = profileById.get(row.talent_profile_id);
  console.log(
    `  - ${p?.profile_code ?? row.talent_profile_id} (${p?.display_name ?? "?"}) ` +
      `holds ${termById.get(row.taxonomy_term_id) ?? row.taxonomy_term_id} ` +
      `[${row.relationship_type}${row.is_primary ? ", primary" : ""}] ` +
      `tenant_id=${row.tenant_id ?? "null"}`,
  );
}

if (rows.length === 0) {
  console.log("\nNo holdovers. Smoke Check A for these terms should already be clean.");
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry-run complete. Re-run with --apply --yes to delete these tenant-scoped rows.");
  process.exit(0);
}

const profileIds = [...new Set(rows.map((r) => r.talent_profile_id))];
const { error: delScoped } = await sb
  .from("talent_profile_taxonomy")
  .delete()
  .eq("tenant_id", agency.id)
  .in("taxonomy_term_id", targetIds)
  .in("talent_profile_id", profileIds);
if (delScoped) {
  console.error("Delete (scoped) failed:", delScoped.message);
  process.exit(1);
}

const { error: delLegacy } = await sb
  .from("talent_profile_taxonomy")
  .delete()
  .is("tenant_id", null)
  .in("taxonomy_term_id", targetIds)
  .in("talent_profile_id", profileIds);
if (delLegacy) {
  console.error("Delete (legacy null tenant) failed:", delLegacy.message);
  process.exit(1);
}

console.log(`\nCleared ${rows.length} holdover row(s) for ${tenantSlug}.`);
console.log("Re-run deploy:smoke / check:taxonomy to confirm the warning is gone.");
