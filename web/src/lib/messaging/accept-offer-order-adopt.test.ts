/**
 * TUL-429: one order per accepted offer. The booking trigger's order is adopted, never duplicated.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/messaging/accept-offer-order-adopt.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { findAdoptableOfferOrder, stampAdoptedOfferOrder } from "./accept-offer-order-adopt";

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
    api.order = () => api;
    api.limit = () => api;
    api.maybeSingle = async () =>
      opts.failFind ? { data: null, error: { message: "boom" } } : { data: orders.filter(match)[0] ?? null, error: null };
    api.then = (resolve: (v: unknown) => unknown) => {
      if (patch) {
        for (const r of orders.filter(match)) Object.assign(r, patch);
        log.push(`stamp ${JSON.stringify(patch)}`);
      }
      return resolve({ data: null, error: null });
    };
    return api;
  };
  return { admin: { from } as unknown as SupabaseClient, log };
}

const T = "t1";
const base = { id: "trigger-order", tenant_id: T, inquiry_id: "i1", source_channel: "offer", currency: "MXN", total_cents: 100000, status: "pending_payment", source_page: null };
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
  await stampAdoptedOfferOrder(admin, { tenantId: T, orderId: "trigger-order", orderKey: "offer_accept:o1" });
  await stampAdoptedOfferOrder(admin, { tenantId: T, orderId: "keyed", orderKey: "offer_accept:o1" });
  assert.equal(rows[0].source_page, "offer_accept:o1");
  assert.equal(rows[1].source_page, "offer_accept:other");
});

test("findOfferOrder consults the adopt helper after its own key", () => {
  const src = readFileSync("src/lib/messaging/accept-offer-payment.ts", "utf8");
  const i = src.indexOf("async findOfferOrder");
  const body = src.slice(i, src.indexOf("async createOfferOrder"));
  assert.ok(body.indexOf("findAdoptableOfferOrder") > body.indexOf(".eq(\"source_page\", orderKey)"));
  assert.match(body, /stampAdoptedOfferOrder/);
});
