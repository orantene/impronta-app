import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listingErrorMessage, listingStatusLabel } from "./listing-copy";

const web = join(__dirname, "..", "..", "..");

test("listing actions refuse impersonation and call the guarded RPCs with the user session", () => {
  const src = readFileSync(join(web, "src/lib/service-hub/listing-actions.ts"), "utf8");
  assert.equal((src.match(/assertNotImpersonating\(\)/g) ?? []).length, 2);
  assert.match(src, /rpc\("upsert_workspace_service_listing"/);
  assert.match(src, /rpc\("respond_workspace_service_listing"/);
  assert.doesNotMatch(src, /createServiceRoleClient/);
});

test("the listing migration is held, additive and enforces floor, exclusivity and consent", () => {
  const dir = join(web, "..", "supabase", "migrations", "_pending_pm");
  const file = readdirSync(dir).find((f) => f.endsWith("_workspace_service_listings_tul1367.sql"));
  assert.ok(file, "held migration missing from _pending_pm");
  const sql = readFileSync(join(dir, file!), "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(code, /\bDROP TABLE\b|\bALTER TABLE public\.(?!workspace_service_listings|workspace_service_hub_settings)/);
  assert.match(sql, /RAISE EXCEPTION 'below_floor'/);
  assert.match(sql, /RAISE EXCEPTION 'exclusive_talent'/);
  assert.match(sql, /a\.kind = 'hub'/);
  // Only the talent's RPC sets 'accepted'; the owner RPC inserts 'offered'.
  assert.match(sql, /is_own_talent_profile\(v_l\.talent_profile_id\)/);
  assert.match(sql, /m\.role IN \('owner','admin'\)/);
  assert.match(sql, /NEW\.currency := v_currency;/);
});

test("refusal messages read plainly in EN and ES", () => {
  assert.match(listingErrorMessage("below_floor", "en", { cents: 105000, currency: "MXN" }), /1,050/);
  assert.match(listingErrorMessage("exclusive_talent", "es"), /exclusivo/);
  assert.equal(listingStatusLabel("accepted", "es"), "A la venta");
  assert.equal(listingStatusLabel("offered", "en"), "Waiting for the talent");
});

test("migration: workspace-level minimum, exclusivity from talent_exclusive_workspace (graceful), currency stop", () => {
  const sql = readFileSync(join(web, "..", "supabase", "migrations", "_pending_pm", "20261231419300_workspace_service_listings_tul1367.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.workspace_service_hub_settings/);
  assert.match(sql, /GREATEST\(COALESCE\(NEW\.talent_lowest_cents, v_amount\), v_min\)/);
  assert.match(sql, /to_regclass\('public\.talent_exclusive_workspace'\)/);
  assert.doesNotMatch(sql, /is_primary/);
  assert.match(sql, /NEW\.currency_changed_at := now\(\);/);
});

test("review fixes: roster-gated upsert, consent reset, terms-bound respond, currency reset, sellable function", () => {
  const raw = readFileSync(join(web, "..", "supabase", "migrations", "_pending_pm", "20261231419300_workspace_service_listings_tul1367.sql"), "utf8");
  const sql = raw.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(sql, /'offering_not_found'/);
  assert.match(sql, /r\.status = 'active'/);
  assert.match(sql, /talent_consented_at = NULL/);
  assert.match(sql, /FUNCTION public\.respond_workspace_service_listing\(\s*p_listing_id\s+uuid,\s*p_accept\s+boolean,\s*p_talent_lowest_cents\s+bigint\s*\)/);
  assert.match(sql, /status = ''accepted''\s+ORDER BY version DESC/);
  assert.match(sql, /RAISE EXCEPTION 'outside_terms'/);
  assert.match(sql, /FUNCTION public\.workspace_service_listing_is_sellable\(p_listing_id uuid\)/);
  assert.match(sql, /price_cents <= 1000000000000/);
  assert.match(raw, /-- ROLLBACK/);
  const actions = readFileSync(join(web, "src/lib/service-hub/listing-actions.ts"), "utf8");
  assert.doesNotMatch(actions, /p_accepted_terms_version/);
});
