import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeAdmin, uuid, type Row } from "@/lib/storefront/__fixtures__/fake-admin";

import { refusalForReject, resolvePromo } from "./promo-resolve";

const TENANT = uuid(1);
const PROMO = uuid(2);
const CUSTOMER = uuid(3);
const OTHER = uuid(4);
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
    ...over,
  };
}

function client(rows: Row[], redemptions: Row[] = [], targets: Row[] = []): SupabaseClient {
  const { admin } = fakeAdmin({ tenant_promo_codes: rows, tenant_promo_redemptions: redemptions, promo_targets: targets });
  return admin as unknown as SupabaseClient;
}

const lines = [{ id: uuid(10), totalCents: 45_500, variantId: null, eventId: null }];
const base = { tenantId: TENANT, customerId: CUSTOMER, lines, now: NOW };

test("a typed code prices through quote(): 15% of $455 MXN rounds to whole pesos", async () => {
  const r = await resolvePromo(client([promoRow({ value: 15 })]), { ...base, code: "  luz10 " });
  assert.deepEqual(r, { ok: true, codeId: PROMO, discountCents: 6_800 });
});

test("unknown, blank and paused codes read as promo_unknown", async () => {
  assert.deepEqual(await resolvePromo(client([promoRow()]), { ...base, code: "NOPE" }), { ok: false, reason: "promo_unknown" });
  assert.deepEqual(await resolvePromo(client([promoRow()]), { ...base, code: "  " }), { ok: false, reason: "promo_unknown" });
  assert.deepEqual(
    await resolvePromo(client([promoRow({ is_active: false })]), { ...base, code: "LUZ10" }),
    { ok: false, reason: "promo_unknown" },
  );
});

test("window refusals keep their customer wording", async () => {
  const late = await resolvePromo(client([promoRow({ ends_at: "2026-10-01" })]), { ...base, code: "LUZ10" });
  assert.deepEqual(late, { ok: false, reason: "promo_expired" });
  const early = await resolvePromo(client([promoRow({ starts_at: "2026-11-01" })]), { ...base, code: "LUZ10" });
  assert.deepEqual(early, { ok: false, reason: "promo_not_started" });
});

test("sold out and the per-client limit count confirmed uses and live holds only", async () => {
  const used: Row[] = [
    { promo_code_id: PROMO, customer_id: OTHER, status: "confirmed", hold_expires_at: null },
    { promo_code_id: PROMO, customer_id: CUSTOMER, status: "held", hold_expires_at: "2026-10-14T19:00:00Z" },
  ];
  const soldOut = await resolvePromo(client([promoRow({ max_redemptions: 2 })], used), { ...base, code: "LUZ10" });
  assert.deepEqual(soldOut, { ok: false, reason: "promo_exhausted" });
  const limit = await resolvePromo(client([promoRow({ per_customer_limit: 1 })], used), { ...base, code: "LUZ10" });
  assert.deepEqual(limit, { ok: false, reason: "promo_customer_limit" });
  const expiredHold: Row[] = [{ promo_code_id: PROMO, customer_id: OTHER, status: "held", hold_expires_at: "2026-10-14T17:00:00Z" }];
  const ok = await resolvePromo(client([promoRow({ max_redemptions: 1 })], expiredHold), { ...base, code: "LUZ10" });
  assert.equal(ok.ok, true);
});

test("a legacy tier code discounts its own tier only", async () => {
  const two = [
    { id: uuid(10), totalCents: 10_000, variantId: uuid(20), eventId: uuid(30) },
    { id: uuid(11), totalCents: 40_000, variantId: uuid(21), eventId: uuid(30) },
  ];
  const r = await resolvePromo(
    client([promoRow({ value: 50, event_id: uuid(30), variant_id: uuid(20) })]),
    { ...base, lines: two, code: "LUZ10" },
  );
  assert.deepEqual(r, { ok: true, codeId: PROMO, discountCents: 5_000 });
  const none = await resolvePromo(
    client([promoRow({ event_id: uuid(31), variant_id: null })]),
    { ...base, lines: two, code: "LUZ10" },
  );
  assert.deepEqual(none, { ok: false, reason: "promo_not_applicable" });
});

test("promo_targets scope: a code for another offering does not apply", async () => {
  const r = await resolvePromo(
    client([promoRow()], [], [{ promo_id: PROMO, target_id: uuid(99) }]),
    { ...base, code: "LUZ10" },
  );
  assert.deepEqual(r, { ok: false, reason: "promo_not_applicable" });
});

test("a failed read is promo_unavailable, never a refusal", async () => {
  const broken = {
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: null, error: { message: "down" } }) }) }) }),
  } as unknown as SupabaseClient;
  assert.deepEqual(await resolvePromo(broken, { ...base, code: "LUZ10" }), { ok: false, reason: "promo_unavailable" });
});

test("reject reasons map onto the existing refusal vocabulary", () => {
  assert.equal(refusalForReject("sold_out"), "promo_exhausted");
  assert.equal(refusalForReject("client_limit"), "promo_customer_limit");
  assert.equal(refusalForReject("locked"), "promo_unknown");
  assert.equal(refusalForReject("wrong_day"), "promo_not_applicable");
  assert.equal(refusalForReject("below_minimum"), "promo_not_applicable");
});
