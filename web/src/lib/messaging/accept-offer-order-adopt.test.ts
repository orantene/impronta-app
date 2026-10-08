/**
 * TUL-429: one order per accepted offer. The booking trigger's order is adopted, never duplicated.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/messaging/accept-offer-order-adopt.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { findAdoptableOfferOrder, findOrClaimOfferOrder, stampAdoptedOfferOrder } from "./accept-offer-order-adopt";

type Row = Record<string, unknown>;

function fake(orders: Row[], opts: { failFind?: boolean } = {}) {
  const log: string[] = [];
  const from = () => {
    type F = { op: "eq" | "neq" | "is"; k: string; v: unknown };
    let filters: F[] = [];
    let patch: Row | null = null;
    const match = (r: Row) =>
      filters.every((f) => (f.op === "eq" ? r[f.k] === f.v : f.op === "neq" ? r[f.k] !== f.v : (r[f.k] ?? null) === f.v));
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.update = (p: Row) => ((patch = p), api);
    for (const op of ["eq", "neq", "is"] as const) {
      api[op] = (k: string, v: unknown) => (filters.push({ op, k, v }), api);
    }
    let newestFirst = false;
    api.order = (_c: string, o?: { ascending?: boolean }) => ((newestFirst = o?.ascending === false), api);
    api.limit = () => api;
    api.maybeSingle = async () => {
      if (opts.failFind) return { data: null, error: { message: "boom" } };
      const hits = orders.filter(match).sort((a, b) => (newestFirst ? -1 : 1) * String(a.created_at).localeCompare(String(b.created_at)));
      return { data: hits[0] ?? null, error: null };
    };
    api.then = (resolve: (v: unknown) => unknown) => {
      if (patch) {
        const hit = orders.filter(match);
        for (const r of hit) Object.assign(r, patch);
        log.push(`stamp ${JSON.stringify(patch)}`);
        return resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      }
      return resolve({ data: null, error: null });
    };
    return api;
  };
  return { admin: { from } as unknown as SupabaseClient, log };
}

const T = "t1";
const base = { created_at: "2026-10-08T15:28:27Z", id: "trigger-order", tenant_id: T, inquiry_id: "i1", source_channel: "offer", currency: "MXN", total_cents: 100000, status: "pending_payment", source_page: null };
const q = { tenantId: T, inquiryId: "i1", totalCents: 100000, currency: "MXN" };

test("adopts the booking trigger's order for the same inquiry, total and currency", async () => {
  const { admin } = fake([{ ...base }]);
  assert.equal(await findAdoptableOfferOrder(admin, q), "trigger-order");
});

test("a paid or refunded trigger order is still THE order", async () => {
  for (const status of ["paid", "refunded"]) {
    const { admin } = fake([{ ...base, status }]);
    assert.equal(await findAdoptableOfferOrder(admin, q), "trigger-order", status);
  }
});

test("never adopts a cancelled order, another inquiry's, another total or currency, or another channel", async () => {
  for (const over of [{ status: "cancelled" }, { inquiry_id: "i2" }, { total_cents: 90000 }, { currency: "USD" }, { source_channel: "messages_offer" }]) {
    const { admin } = fake([{ ...base, ...over }]);
    assert.equal(await findAdoptableOfferOrder(admin, q), null, JSON.stringify(over));
  }
});

test("a failed read finds nothing (the caller then creates, as before) and does not throw", async () => {
  const { admin } = fake([{ ...base }], { failFind: true });
  assert.equal(await findAdoptableOfferOrder(admin, q), null);
});

test("stamping sets the pay path's key only while the order has none", async () => {
  const rows = [{ ...base }, { ...base, id: "keyed", source_page: "offer_accept:other" }];
  const { admin } = fake(rows);
  assert.equal(await stampAdoptedOfferOrder(admin, { tenantId: T, orderId: "trigger-order", orderKey: "offer_accept:o1" }), true);
  assert.equal(await stampAdoptedOfferOrder(admin, { tenantId: T, orderId: "keyed", orderKey: "offer_accept:o1" }), false, "lost claim: no row changed");
  assert.equal(rows[0].source_page, "offer_accept:o1");
  assert.equal(rows[1].source_page, "offer_accept:other");
});

test("an order another offer's pay path already claimed is never adopted", async () => {
  const { admin } = fake([{ ...base, source_page: "offer_accept:OFFER-A" }]);
  assert.equal(await findAdoptableOfferOrder(admin, q), null);
});

test("two offers, same total, one inquiry: two distinct orders, each claimed by its own offer", async () => {
  const a = { ...base, id: "order-a", created_at: "2026-10-08T15:00:00Z" };
  const b = { ...base, id: "order-b", created_at: "2026-10-08T16:00:00Z" };
  const rows = [a, b];
  const { admin } = fake(rows);
  // Offer A pays first: the newest unclaimed order is B's, but A's own trigger order is older.
  // The pay path claims whatever it adopts; the NEXT offer can then never take the same one.
  const first = await findAdoptableOfferOrder(admin, q);
  assert.equal(first, "order-b");
  await stampAdoptedOfferOrder(admin, { tenantId: T, orderId: first!, orderKey: "offer_accept:OFFER-B" });
  const second = await findAdoptableOfferOrder(admin, q);
  assert.equal(second, "order-a");
  await stampAdoptedOfferOrder(admin, { tenantId: T, orderId: second!, orderKey: "offer_accept:OFFER-A" });
  assert.notEqual(first, second);
  assert.equal(await findAdoptableOfferOrder(admin, q), null, "both claimed: a third lookup creates, never reuses");
  assert.equal(rows.find((r) => r.id === "order-a")!.source_page, "offer_accept:OFFER-A");
  assert.equal(rows.find((r) => r.id === "order-b")!.source_page, "offer_accept:OFFER-B");
});

test("a lost claim is never used: the conditional update changed no row, so the id is not returned", async () => {
  let reads = 0;
  const id = await findOrClaimOfferOrder({
    byKey: async () => (reads++, null),
    findAdoptable: async () => "shared-order",
    claim: async () => false,
  });
  assert.equal(id, null, "falls through to create");
  assert.equal(reads, 2, "re-read by key after losing the claim");
});

test("a lost claim whose winner stamped OUR key resolves to that order", async () => {
  let reads = 0;
  const id = await findOrClaimOfferOrder({
    byKey: async () => (reads++ === 0 ? null : "ours"),
    findAdoptable: async () => "ours",
    claim: async () => false,
  });
  assert.equal(id, "ours");
});

test("a won claim returns the adopted order; its own key wins over adoption", async () => {
  assert.equal(await findOrClaimOfferOrder({ byKey: async () => null, findAdoptable: async () => "t", claim: async () => true }), "t");
  assert.equal(await findOrClaimOfferOrder({ byKey: async () => "keyed", findAdoptable: async () => { throw new Error("must not look"); }, claim: async () => true }), "keyed");
});

test("findOfferOrder consults the adopt helper after its own key", () => {
  const src = readFileSync("src/lib/messaging/accept-offer-payment.ts", "utf8");
  const i = src.indexOf("async findOfferOrder");
  const body = src.slice(i, src.indexOf("async createOfferOrder"));
  assert.ok(body.indexOf("findAdoptableOfferOrder") > body.indexOf(".eq(\"source_page\", orderKey)"));
  assert.match(body, /findOrClaimOfferOrder/);
  // Keyed lookups carry no channel filter, so an adopted ('offer' channel) order is found next time.
  assert.doesNotMatch(body.slice(0, body.indexOf("findAdoptableOfferOrder")), /source_channel/);
});
