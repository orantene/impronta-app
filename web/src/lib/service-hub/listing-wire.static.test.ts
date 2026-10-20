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
  assert.doesNotMatch(sql, /\bDROP TABLE\b|\bALTER TABLE public\.(?!workspace_service_listings)/);
  assert.match(sql, /RAISE EXCEPTION 'below_floor'/);
  assert.match(sql, /RAISE EXCEPTION 'exclusive_talent'/);
  assert.match(sql, /a\.kind = 'hub'/);
  // Only the talent's RPC sets 'accepted'; the owner RPC inserts 'offered'.
  assert.match(sql, /is_own_talent_profile\(v_talent\)/);
  assert.match(sql, /m\.role IN \('owner','admin'\)/);
  assert.match(sql, /NEW\.currency := upper\(v_currency\)/);
});

test("refusal messages read plainly in EN and ES", () => {
  assert.match(listingErrorMessage("below_floor", "en", { cents: 105000, currency: "MXN" }), /1,050/);
  assert.match(listingErrorMessage("exclusive_talent", "es"), /exclusivo/);
  assert.equal(listingStatusLabel("accepted", "es"), "A la venta");
  assert.equal(listingStatusLabel("offered", "en"), "Waiting for the talent");
});
