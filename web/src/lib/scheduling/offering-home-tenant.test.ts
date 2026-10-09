/**
 * TUL-451: a "both" owner's talent site books under the offering's own tenant;
 * the guest's refusals follow the page's language.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/scheduling/offering-home-tenant.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { localizedBookingRefusal } from "./instant-book-refusal-copy";
import { resolveOfferingHomeTenant } from "./offering-home-tenant";

function fake(row: Record<string, unknown> | null, error = false) {
  const api: Record<string, unknown> = {};
  api.select = () => api;
  api.eq = () => api;
  api.maybeSingle = async () => (error ? { data: null, error: { message: "x" } } : { data: row, error: null });
  return { from: () => api } as unknown as SupabaseClient;
}
const q = { offeringId: "o1", talentProfileId: "tp1", tenantId: "hub" };

test("a 'both' owner's offering lives under her workspace: the booking goes there, not to the page's tenant", async () => {
  const r = await resolveOfferingHomeTenant(fake({ tenant_id: "workspace-new", talent_profile_id: "tp1" }), q);
  assert.deepEqual(r, { ok: true, tenantId: "workspace-new" });
});

test("a 'myself' site (same tenant) is unchanged", async () => {
  assert.deepEqual(await resolveOfferingHomeTenant(fake({ tenant_id: "hub", talent_profile_id: "tp1" }), q), { ok: true, tenantId: "hub" });
});

test("another talent's offering is never pulled into a workspace by naming it: the caller's tenant stays", async () => {
  assert.deepEqual(await resolveOfferingHomeTenant(fake({ tenant_id: "other-ws", talent_profile_id: "someone-else" }), q), { ok: true, tenantId: "hub" });
});

test("no such offering keeps the caller's tenant (it then fails exactly as before); a failed read fails closed", async () => {
  assert.deepEqual(await resolveOfferingHomeTenant(fake(null), q), { ok: true, tenantId: "hub" });
  assert.deepEqual(await resolveOfferingHomeTenant(fake(null, true), q), { ok: false });
});

test("placeInstantPurchase re-homes ONLY on a direct talent channel (agencyRouted === false), staff desk and agency storefront keep their tenant", () => {
  const src = readFileSync("src/lib/scheduling/instant-purchase.ts", "utf8");
  assert.match(src, /input\.agencyRouted === false/);
  assert.match(src, /resolveOfferingHomeTenant\(/);
  assert.doesNotMatch(src, /const \{ offeringId, tenantId \} = input;/);
  assert.match(readFileSync("src/lib/server-actions/instant-book-action.ts", "utf8"), /localizedBookingRefusal\(booked\.reason, bookingLocale, booked\.error\)/);
});

test("refusals follow the page's language (Spanish page, Spanish words) and keep the engine sentence when there is no entry", () => {
  const en = "This one is booked by request. Send a message to ask for a time.";
  assert.match(localizedBookingRefusal("request_only", "es", en)!, /^Este servicio se reserva por solicitud/);
  assert.equal(localizedBookingRefusal("request_only", "en", "x"), en);
  assert.match(localizedBookingRefusal("not_accepting_bookings", "es", "x")!, /reservas nuevas/);
  assert.match(localizedBookingRefusal("slot_taken", "es", "x")!, /ocuparse/);
  assert.equal(localizedBookingRefusal("sold_out", "es", "Sold out"), "Sold out");
});
