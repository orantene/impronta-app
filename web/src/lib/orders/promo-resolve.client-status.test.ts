import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeAdmin, uuid, type Row } from "@/lib/storefront/__fixtures__/fake-admin";
import { classifyClientStatus, loadClientStatus } from "@/lib/promos/repo";

import { resolvePromo } from "./promo-resolve";

const TENANT = uuid(1);
const PROMO = uuid(2);
const CUSTOMER = uuid(3);
const AUTO = uuid(5);
const NOW = new Date("2026-10-14T18:00:00Z");

function promoRow(over: Partial<Row> = {}): Row {
  return {
    id: PROMO, tenant_id: TENANT, code: "LUZ10", name: null, label: null, kind: "percent", offer_kind: "percent",
    value: 10, currency: "MXN", addon_id: null, scope_kind: "all", min_subtotal_cents: null, audience: "public",
    customer_id: null, is_single_use: false, unlock: "code", link_slug: null, applies_on: "purchase",
    starts_at: null, ends_at: null, use_by_date: null, tz: "America/Mexico_City", weekdays: null,
    time_from: null, time_to: null, slot_id: null, max_redemptions: null, per_customer_limit: 5,
    deposit_required: false, show_on_site: false, show_countdown: false, title_i18n: null, description_i18n: null,
    visual_style: null, template_key: null, is_active: true, is_draft: false, is_paused: false, archived_at: null,
    is_trial: false, parent_promo_id: null, created_at: "2026-10-01T00:00:00Z", event_id: null, variant_id: null,
    lapsed_days: null,
    ...over,
  };
}

function order(created_at: string, status = "paid", over: Partial<Row> = {}): Row {
  return { id: uuid(Math.floor(Math.random() * 1e6) + 100), tenant_id: TENANT, customer_id: CUSTOMER, status, created_at, ...over };
}

function client(promos: Row[], orders: Row[] = []): SupabaseClient {
  const { admin } = fakeAdmin({ tenant_promo_codes: promos, tenant_promo_redemptions: [], promo_targets: [], orders });
  return admin as unknown as SupabaseClient;
}

const lines = [{ id: uuid(10), totalCents: 45_500, variantId: null, eventId: null }];
const base = { tenantId: TENANT, customerId: CUSTOMER, lines, now: NOW, code: "LUZ10" };

test("classifyClientStatus: none = new, recent = returning, old = lapsed, custom gap honoured", () => {
  assert.equal(classifyClientStatus(null, NOW), "new");
  assert.equal(classifyClientStatus("2026-09-01T00:00:00Z", NOW), "returning");
  assert.equal(classifyClientStatus("2026-06-01T00:00:00Z", NOW), "lapsed");
  assert.equal(classifyClientStatus("2026-09-01T00:00:00Z", NOW, 30), "lapsed");
});

test("loadClientStatus counts only paid orders of this tenant and customer", async () => {
  const c = client([], [
    order("2026-10-01T00:00:00Z", "pending_payment"),
    order("2026-10-02T00:00:00Z", "paid", { tenant_id: uuid(77) }),
    order("2026-05-01T00:00:00Z", "fulfilled"),
  ]);
  assert.equal(await loadClientStatus(c, { tenantId: TENANT, customerId: CUSTOMER, now: NOW }), "lapsed");
  assert.equal(await loadClientStatus(client([]), { tenantId: TENANT, customerId: CUSTOMER, now: NOW }), "new");
  assert.equal(await loadClientStatus(client([]), { tenantId: TENANT, customerId: null, now: NOW }), "new");
});

test("a new-clients code refuses a returning client and works for a new one", async () => {
  const promos = [promoRow({ audience: "new_clients" })];
  const returning = await resolvePromo(client(promos, [order("2026-10-01T00:00:00Z")]), base);
  assert.deepEqual(returning, { ok: false, reason: "promo_not_applicable" });
  const fresh = await resolvePromo(client(promos), base);
  assert.equal(fresh.ok, true);
});

test("a lapsed code uses the promo's lapsed_days", async () => {
  const promos = [promoRow({ audience: "lapsed", lapsed_days: 30 })];
  const r = await resolvePromo(client(promos, [order("2026-08-01T00:00:00Z")]), base);
  assert.deepEqual(r, { ok: true, codeId: PROMO, discountCents: 4_500 });
});

test("a better live auto promo wins: ok with the auto promo, betterDeal, code not consumed", async () => {
  const promos = [promoRow({ value: 10 }), promoRow({ id: AUTO, code: null, unlock: "auto", value: 20 })];
  const r = await resolvePromo(client(promos), base);
  assert.deepEqual(r, { ok: true, codeId: AUTO, discountCents: 9_100, betterDeal: true });
});

test("a weaker auto promo leaves the typed code in charge", async () => {
  const promos = [promoRow({ value: 20 }), promoRow({ id: AUTO, code: null, unlock: "auto", value: 5 })];
  const r = await resolvePromo(client(promos), base);
  assert.deepEqual(r, { ok: true, codeId: PROMO, discountCents: 9_100 });
});

test("a paused auto promo never competes", async () => {
  const promos = [promoRow({ value: 10 }), promoRow({ id: AUTO, code: null, unlock: "auto", value: 50, is_paused: true })];
  const r = await resolvePromo(client(promos), base);
  assert.deepEqual(r, { ok: true, codeId: PROMO, discountCents: 4_500 });
});
