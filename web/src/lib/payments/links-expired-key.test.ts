/**
 * TUL-400: a dead link / reservation must not block a fresh pay-link request.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/payments/links-expired-key.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPaymentLink } from "./links";

type Tbl = Record<string, unknown>[];
const KEY = "offer-accept:o1:v4";

function world(link: Tbl, reservation: Tbl) {
  const t: Record<string, Tbl> = {
    payment_links: link,
    order_collection_reservations: reservation,
    orders: [{ id: "ord1", tenant_id: "t1", status: "pending_payment", currency: "MXN" }],
  };
  const log: string[] = [];
  const from = (name: string) => {
    let filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;
    const api: Record<string, unknown> = {};
    const rows = () => (t[name] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    api.select = () => api;
    api.eq = (k: string, v: unknown) => {
      filters.push([k, v]);
      return api;
    };
    api.update = (p: Record<string, unknown>) => {
      patch = p;
      return api;
    };
    api.insert = async (row: Record<string, unknown>) => {
      t[name] = [...(t[name] ?? []), row];
      log.push(`insert ${name}`);
      return { error: null };
    };
    api.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    api.then = (resolve: (v: unknown) => unknown) => {
      if (patch) {
        for (const r of rows()) Object.assign(r, patch);
        log.push(`update ${name} ${JSON.stringify(patch)}`);
        patch = null;
        filters = [];
      }
      return resolve({ data: null, error: null });
    };
    return api;
  };
  const rpc = async () => {
    // pos_reserve_collection: the same live key answers "already"; a freed key mints.
    const clash = (t.order_collection_reservations ?? []).find((r) => r.operation_key === KEY);
    if (clash) return { data: { ok: true, already: true, reservation_id: clash.id, state: clash.state, amount_cents: 100000 }, error: null };
    return { data: { ok: true, already: false, reservation_id: "res-new", state: "reserved", amount_cents: 100000, expires_at: new Date(Date.now() + 1_800_000).toISOString() }, error: null };
  };
  return { admin: { from, rpc } as never, t, log };
}

const input = { tenantId: "t1", orderId: "ord1", amountCents: 100000, idempotencyKey: KEY, actorUserId: null, publicOrigin: "http://x.localhost:3001", env: { PAYMENTS_MOCK: "1" } } as never;
const past = new Date(Date.now() - 60_000).toISOString();

test("an open link past its expiry is expired and its key freed", async () => {
  const w = world([{ code: "c1", tenant_id: "t1", operation_key: KEY, status: "open", expires_at: past, amount_cents: 100000 }], []);
  await createPaymentLink(w.admin, input);
  const link = w.t.payment_links.find((r) => r.code === "c1")!;
  assert.equal(link.status, "expired");
  assert.notEqual(link.operation_key, KEY);
});

test("a released reservation keeps no claim on the key", async () => {
  const w = world([], [{ id: "r1", order_id: "ord1", operation_key: KEY, state: "released", expires_at: past }]);
  await createPaymentLink(w.admin, input);
  const res = w.t.order_collection_reservations.find((r) => r.id === "r1")!;
  assert.notEqual(res.operation_key, KEY);
});

test("a lapsed 'reserved' reservation is released and its key freed", async () => {
  const w = world([], [{ id: "r2", order_id: "ord1", operation_key: KEY, state: "reserved", expires_at: past }]);
  await createPaymentLink(w.admin, input);
  const res = w.t.order_collection_reservations.find((r) => r.id === "r2")!;
  assert.equal(res.state, "released");
  assert.notEqual(res.operation_key, KEY);
});

test("a settled reservation is never touched", async () => {
  const w = world([], [{ id: "r3", order_id: "ord1", operation_key: KEY, state: "settled", expires_at: past }]);
  await createPaymentLink(w.admin, input);
  const res = w.t.order_collection_reservations.find((r) => r.id === "r3")!;
  assert.equal(res.operation_key, KEY);
  assert.equal(res.state, "settled");
});

test("a live reservation is left alone", async () => {
  const w = world([], [{ id: "r4", order_id: "ord1", operation_key: KEY, state: "reserved", expires_at: new Date(Date.now() + 600_000).toISOString() }]);
  await createPaymentLink(w.admin, input);
  assert.equal(w.t.order_collection_reservations.find((r) => r.id === "r4")!.operation_key, KEY);
});
