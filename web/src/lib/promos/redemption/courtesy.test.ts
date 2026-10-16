import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computePromoResult } from "../results/compute";

import { courtesyPromoRow, giveCourtesy, isCourtesyReason, type CourtesyDeps } from "./courtesy";
import type { RpcResult } from "./service";

type Rec = Record<string, unknown>;

/** Tables as arrays; eq / is / not / neq / limit / insert / update; `fail` errors a table's reads. */
function world(tables: Record<string, Rec[]>, fail: string[] = []) {
  const inserts: Array<{ table: string; row: Rec }> = [];
  const updates: Array<{ table: string; patch: Rec }> = [];
  const from = (table: string) => {
    const filters: Array<(r: Rec) => boolean> = [];
    let mode: "read" | "insert" | "update" = "read";
    let payload: Rec = {};
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const err = fail.includes(table) ? { message: "boom", code: "XX000" } : null;
    const result = () => {
      if (err) return { data: null, error: err };
      if (mode === "insert") {
        const row = { id: `${table}-${inserts.length + 1}`, ...payload };
        inserts.push({ table, row: payload });
        (tables[table] ??= []).push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const hit = rows();
        updates.push({ table, patch: payload });
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit, error: null };
      }
      // Copies, like a real read: a later write must not change what was read.
      return { data: rows().map((r) => ({ ...r })), error: null };
    };
    const q = {
      select: () => q,
      insert: (row: Rec) => { mode = "insert"; payload = row; return q; },
      update: (patch: Rec) => { mode = "update"; payload = patch; return q; },
      eq: (k: string, v: unknown) => { if (!k.includes(".")) filters.push((r) => r[k] === v); return q; },
      in: (k: string, vs: readonly unknown[]) => { filters.push((r) => vs.includes(r[k])); return q; },
      is: () => q,
      not: () => q,
      neq: () => q,
      limit: () => q,
      single: async () => result(),
      maybeSingle: async () => {
        const r = result();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
      },
      then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => resolve(result()),
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, inserts, updates, tables };
}

function deps(over: Partial<CourtesyDeps> = {}) {
  const seen = { holds: [] as Rec[], confirms: [] as Rec[], settled: [] as Rec[], links: [] as string[], released: [] as string[] };
  const d: CourtesyDeps = {
    holdPromo: async (_db, input): Promise<RpcResult> => { seen.holds.push(input); return { ok: true, redemption_id: "red-1", status: "held" }; },
    confirmRedemption: async (_db, input): Promise<RpcResult> => { seen.confirms.push(input); return { ok: true, already: false }; },
    ledgerPaidCents: async () => 0,
    paymentInFlight: async () => false,
    releaseRedemption: async (_db, id): Promise<RpcResult> => { seen.released.push(id); return { ok: true }; },
    cancelPaymentLink: async (_db, input) => { seen.links.push(input.linkId); return { ok: true, already: false }; },
    completeZeroTotalOrder: async (_db, input) => { seen.settled.push(input); return { ok: true, orderId: input.orderId, status: "paid", committed: 0 }; },
    code: () => "CORTES-7K2Q",
    ...over,
  };
  return { d, seen };
}

const T = "t1";
const NOW = new Date("2026-10-14T12:00:00Z");
const booking = (over: Rec = {}): Rec => ({ id: "b1", tenant_id: T, status: "confirmed", customer_id: "c1", order_id: "o1", ...over });
const order = (over: Rec = {}): Rec => ({
  id: "o1", tenant_id: T, status: "pending_payment", subtotal_cents: 80000, discount_cents: 0, tax_cents: 0, tip_cents: 0,
  total_cents: 80000, currency: "mxn", version: 3, ...over,
});
const link = { id: "pl1", tenant_id: T, order_id: "o1", status: "open" };

test("Cortesía: 100% one-client promo, discount = list, order settles as a FREE SALE (never cancelled), links down", async () => {
  const w = world({ agency_bookings: [booking()], orders: [order()], payment_links: [link], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const { d, seen } = deps();
  const r = await giveCourtesy(w.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "influencer", now: NOW }, d);
  assert.deepEqual(r, { ok: true, already: false, promoId: "tenant_promo_codes-1", redemptionId: "red-1", giftedCents: 80000, currency: "MXN" });

  const promo = w.inserts[0]?.row ?? {};
  assert.equal(promo.courtesy_reason, "influencer");
  assert.equal(promo.value, 100);
  assert.equal(promo.audience, "one_client");
  assert.equal(promo.customer_id, "c1");
  assert.equal(promo.max_redemptions, 1);
  assert.equal(promo.leak_guard, false);

  assert.equal(seen.holds[0]?.bookingId, "b1");
  assert.equal(seen.holds[0]?.orderId, null);
  assert.equal(seen.holds[0]?.isPricePromo, false);
  assert.equal(seen.holds[0]?.discountCents, 80000);
  assert.deepEqual(
    { list: seen.confirms[0]?.listCents, disc: seen.confirms[0]?.discountCents, cur: seen.confirms[0]?.currency },
    { list: 80000, disc: 80000, cur: "MXN" },
  );
  assert.deepEqual(seen.links, ["pl1"]);
  assert.deepEqual(seen.settled, [{ tenantId: T, orderId: "o1" }]);
  const o = w.tables.orders?.[0] ?? {};
  assert.deepEqual(
    [o.discount_cents, o.tax_cents, o.tip_cents, o.total_cents, o.version, o.status],
    [80000, 0, 0, 0, 4, "pending_payment"], // the fake writer flips to paid; the real one is completeZeroTotalOrder
  );
  assert.ok(!w.updates.some((u) => u.table === "orders" && u.patch.status === "cancelled"));

  // PR5 results: the confirmed row is gifted value, never "given", and earns 0.
  const res = computePromoResult({
    promoId: "p", rows: [{ promo_code_id: "p", status: "confirmed", list_cents: 80000, discount_cents: 80000, source_channel: null, client_status: null, is_price_promo: false, created_at: NOW.toISOString() }],
  });
  assert.deepEqual([res.giftedCents, res.givenCents, res.earnedCents], [80000, 0, 0]);
});

test("Cortesía: a booking with no order uses the talent's price; none given is invalid", async () => {
  const w = world({ agency_bookings: [booking({ order_id: null })], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const { d, seen } = deps();
  const r = await giveCourtesy(w.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", listCents: 45000, currency: "usd", now: NOW }, d);
  assert.ok(r.ok && r.giftedCents === 45000 && r.currency === "USD");
  assert.equal(seen.settled.length, 0);
  const w2 = world({ agency_bookings: [booking({ order_id: null })], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const bad = await giveCourtesy(w2.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", listCents: 12.5, now: NOW }, deps().d);
  assert.deepEqual(bad, { ok: false, error: "invalid" });
});

test("Cortesía refusals: bad reason, other tenant, cancelled, no client, already paid, money landing", async () => {
  const base = () => ({ agency_bookings: [booking()], orders: [order()], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const call = (tables: Record<string, Rec[]>, input: Partial<{ reason: string; tenantId: string }>, over: Partial<CourtesyDeps> = {}) =>
    giveCourtesy(world(tables).db, { tenantId: input.tenantId ?? T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: input.reason ?? "other", now: NOW }, deps(over).d);
  assert.deepEqual(await call(base(), { reason: "free" }), { ok: false, error: "invalid" });
  assert.deepEqual(await call(base(), { tenantId: "t2" }), { ok: false, error: "not_found" });
  assert.deepEqual(await call({ ...base(), agency_bookings: [booking({ status: "cancelled" })] }, {}), { ok: false, error: "cancelled" });
  assert.deepEqual(await call({ ...base(), agency_bookings: [booking({ customer_id: null })] }, {}), { ok: false, error: "needs_client" });
  assert.deepEqual(await call(base(), {}, { ledgerPaidCents: async () => 500 }), { ok: false, error: "already_paid" });
  assert.deepEqual(await call(base(), {}, { paymentInFlight: async () => true }), { ok: false, error: "already_paid" });
  assert.deepEqual(await call(base(), {}, { ledgerPaidCents: async () => null }), { ok: false, error: "unavailable" });
});

test("Cortesía: every failed read is unavailable, never a free booking", async () => {
  for (const table of ["agency_bookings", "tenant_promo_redemptions", "orders"]) {
    const w = world({ agency_bookings: [booking()], orders: [order()], tenant_promo_redemptions: [], tenant_promo_codes: [] }, [table]);
    const { d, seen } = deps();
    const r = await giveCourtesy(w.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", now: NOW }, d);
    assert.deepEqual(r, { ok: false, error: "unavailable" }, table);
    assert.equal(seen.holds.length, 0);
  }
});

test("Cortesía: a link whose payment already completed refuses before anything is gifted", async () => {
  const w = world({ agency_bookings: [booking()], orders: [order()], payment_links: [link], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const { d, seen } = deps({ cancelPaymentLink: async () => ({ ok: false, reason: "already_paid" }) });
  const r = await giveCourtesy(w.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", now: NOW }, d);
  assert.deepEqual(r, { ok: false, error: "already_paid" });
  assert.equal(w.inserts.length, 0);
  assert.equal(seen.holds.length, 0);
});

test("Cortesía: the free sale fails -> hold released, promo retired, nothing confirmed", async () => {
  const w = world({ agency_bookings: [booking()], orders: [order()], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const { d, seen } = deps({ completeZeroTotalOrder: async () => ({ ok: false, reason: "unavailable" }) });
  const r = await giveCourtesy(w.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", now: NOW }, d);
  assert.deepEqual(r, { ok: false, error: "unavailable" });
  assert.deepEqual(seen.released, ["red-1"]);
  assert.equal(seen.confirms.length, 0);
  assert.ok(w.updates.some((u) => u.table === "tenant_promo_codes" && typeof u.patch.archived_at === "string"));
});

test("Cortesía: a stale order version (changed meanwhile) settles nothing", async () => {
  const stale = order();
  const w = world({ agency_bookings: [booking()], orders: [stale], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const { d, seen } = deps({
    holdPromo: async () => { stale.version = 9; return { ok: true, redemption_id: "red-1" }; },
  });
  const r = await giveCourtesy(w.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", now: NOW }, d);
  assert.deepEqual(r, { ok: false, error: "unavailable" });
  assert.equal(seen.settled.length, 0);
  assert.equal(seen.confirms.length, 0);
});

test("Cortesía: an already-free paid order needs no money step; a cancelled order is refused", async () => {
  const free = world({ agency_bookings: [booking()], orders: [order({ status: "paid", total_cents: 0 })], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const a = deps();
  assert.ok((await giveCourtesy(free.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", now: NOW }, a.d)).ok);
  assert.equal(a.seen.settled.length, 0);
  const dead = world({ agency_bookings: [booking()], orders: [order({ status: "cancelled" })], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  assert.deepEqual(await giveCourtesy(dead.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", now: NOW }, deps().d), { ok: false, error: "unavailable" });
});

test("Cortesía: a refused hold retires the courtesy promo and charges nothing off", async () => {
  const w = world({ agency_bookings: [booking()], orders: [order()], tenant_promo_redemptions: [], tenant_promo_codes: [] });
  const { d, seen } = deps({ holdPromo: async () => ({ ok: false, reason: "inactive" }) });
  const r = await giveCourtesy(w.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "make_good", now: NOW }, d);
  assert.deepEqual(r, { ok: false, error: "unavailable" });
  assert.ok(w.updates.some((u) => u.table === "tenant_promo_codes" && typeof u.patch.archived_at === "string"));
  assert.equal(seen.settled.length, 0);
});

test("Cortesía: a second call on the same booking answers already, no second promo", async () => {
  const w = world({
    agency_bookings: [booking()], orders: [order()], tenant_promo_codes: [],
    tenant_promo_redemptions: [{ id: "red-0", promo_code_id: "pc-0", booking_id: "b1", status: "confirmed", discount_cents: 80000, currency: "MXN" }],
  });
  const { d, seen } = deps();
  const r = await giveCourtesy(w.db, { tenantId: T, talentProfileId: "tp1", actorUserId: "u1", bookingId: "b1", reason: "gift", now: NOW }, d);
  assert.deepEqual(r, { ok: true, already: true, promoId: "pc-0", redemptionId: "red-0", giftedCents: 80000, currency: "MXN" });
  assert.equal(w.inserts.length, 0);
  assert.equal(seen.holds.length, 0);
});

test("isCourtesyReason + courtesyPromoRow: the four reasons only; the row passes the table checks", () => {
  for (const r of ["influencer", "gift", "make_good", "other"]) assert.equal(isCourtesyReason(r), true);
  assert.equal(isCourtesyReason("free"), false);
  const row = courtesyPromoRow({ tenantId: T, talentProfileId: "tp1", customerId: "c1", reason: "gift", code: "X-1", currency: "MXN", createdBy: "u1", now: NOW });
  assert.equal(row.applies_on, "appointment");
  assert.equal(row.talent_profile_id, "tp1", "a courtesy promo belongs to the talent giving it");
  assert.equal(row.unlock, "code");
  assert.equal(row.offer_kind, "percent");
});
