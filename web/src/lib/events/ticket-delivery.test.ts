import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * `deliverTicketsForOrder` / `deliverTicketForAdmission` against a scripted
 * PostgREST fake. Each `from(table)` returns a chain that records the
 * filters and the update payload, then resolves from `rows[table]`.
 *
 * The e-mail sender is the real `sendEmailResult`, which with no
 * RESEND_API_KEY returns `skipped` (and writes the dev outbox when
 * EMAIL_DEV_OUTBOX_DIR is set). NODE_ENV is not production here, so
 * `skipped` counts as delivered, which is what local QA relies on.
 */
process.env.GUEST_COOKIE_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.EMAIL_DEV_OUTBOX_DIR = "";

import { deliverTicketsForOrder, deliverTicketForAdmission } from "./ticket-delivery";

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> };

function fakeAdmin(rows: Record<string, Row[]>, calls: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      let result: Row[] = rows[table] ?? [];
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      const filter = (op: string) => (col: string, val: unknown) => {
        call.filters.push([col, op, val]);
        if (op === "eq") result = result.filter((r) => r[col] === val);
        if (op === "in") result = result.filter((r) => (val as unknown[]).includes(r[col]));
        if (op === "is" && val === null) result = result.filter((r) => r[col] == null);
        return chain;
      };
      Object.assign(chain, {
        select: () => chain,
        update: (payload: unknown) => { call.op = "update"; call.payload = payload; return chain; },
        eq: filter("eq"), in: filter("in"), is: filter("is"),
        order: self, limit: self,
        maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: result, error: null }).then(res),
      });
      return chain;
    },
  };
}

const T = "11111111-1111-4111-8111-111111111111";
const ADM = "22222222-2222-4222-8222-222222222222";
const ADM2 = "33333333-3333-4333-8333-333333333333";
const LINE = "line-1"; const ORDER = "order-1"; const SESSION = "sess-1"; const EVENT = "ev-1";

function world(over: Partial<Record<string, Row[]>> = {}) {
  return {
    order_lines: [{ id: LINE, order_id: ORDER, label: "Entrada general", tenant_id: T }],
    admissions: [
      { id: ADM, tenant_id: T, token_version: 1, holder_name: "Ana", holder_email: "ana@example.com", session_id: SESSION, order_line_id: LINE, customer_id: null, party_size: 1, status: "valid", delivery: null },
    ],
    orders: [{ id: ORDER, tenant_id: T, customer_id: null, receipt_code: "R1" }],
    sessions: [{ id: SESSION, tenant_id: T, starts_at: "2026-10-03T23:00:00Z", event_id: EVENT }],
    events: [{ id: EVENT, tenant_id: T, title: "LUMINA", venue_id: null }],
    agencies: [{ id: T, timezone: "America/Cancun", default_locale: "es" }],
    booking_transactions: [],
    customers: [],
    ...over,
  };
}

test("delivers once per admission: the second pass claims nothing and sends nothing", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world(), calls);
  const first = await deliverTicketsForOrder(admin, { tenantId: T, orderId: ORDER });
  assert.deepEqual(first, { ok: true, sent: 1, skipped: 0 });
  const claim = calls.find((c) => c.table === "admissions" && c.op === "update");
  assert.ok(claim, "the claim UPDATE happened");
  assert.ok(claim.filters.some(([c, op, v]) => c === "delivery" && op === "is" && v === null), "claimed only undelivered rows");
  assert.ok(claim.filters.some(([c, , v]) => c === "tenant_id" && v === T), "tenant-scoped");
  const stamp = calls.filter((c) => c.table === "admissions" && c.op === "update").at(-1)!;
  assert.match(JSON.stringify(stamp.payload), /"sent_at"/);

  // Second pass: the row now carries a delivery record.
  const calls2: Call[] = [];
  const admin2 = fakeAdmin(world({ admissions: [{ ...world().admissions[0], delivery: { method: "email", sent_at: "x" } }] }), calls2);
  const second = await deliverTicketsForOrder(admin2, { tenantId: T, orderId: ORDER });
  assert.deepEqual(second, { ok: true, sent: 0, skipped: 1 });
});

test("force (resend) sends despite an existing delivery record", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world({ admissions: [{ ...world().admissions[0], delivery: { method: "email", sent_at: "x" } }] }), calls);
  const res = await deliverTicketForAdmission(admin, { tenantId: T, admissionId: ADM, force: true });
  assert.deepEqual(res, { ok: true, sent: 1, skipped: 0 });
  const claim = calls.find((c) => c.table === "admissions" && c.op === "update")!;
  assert.ok(!claim.filters.some(([c]) => c === "delivery"), "no null filter on a forced resend");
  assert.match(JSON.stringify(calls.filter((c) => c.table === "admissions" && c.op === "update").at(-1)!.payload), /"resent_at"/);
});

test("recipient falls back holder → customer → payer; none releases the claim", async () => {
  const noHolder = { ...world().admissions[0], holder_email: null };
  // customer
  let calls: Call[] = [];
  let res = await deliverTicketsForOrder(
    fakeAdmin(world({ admissions: [noHolder], orders: [{ id: ORDER, tenant_id: T, customer_id: "c1", receipt_code: "R1" }], customers: [{ id: "c1", tenant_id: T, email: "cust@example.com", locale: "en" }] }), calls),
    { tenantId: T, orderId: ORDER },
  );
  assert.equal(res.ok, true);
  // payer
  calls = [];
  res = await deliverTicketsForOrder(
    fakeAdmin(world({ admissions: [noHolder], booking_transactions: [{ tenant_id: T, order_id: ORDER, payer_email: "payer@example.com" }] }), calls),
    { tenantId: T, orderId: ORDER },
  );
  assert.equal(res.ok, true);
  // nobody
  calls = [];
  res = await deliverTicketsForOrder(fakeAdmin(world({ admissions: [noHolder] }), calls), { tenantId: T, orderId: ORDER });
  assert.deepEqual(res, { ok: false, reason: "channel_unavailable" });
  const updates = calls.filter((c) => c.table === "admissions" && c.op === "update");
  assert.deepEqual(updates.at(-1)!.payload, { delivery: null }, "the claim was released");
});

test("two admissions on one order go out in one mail, both stamped", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world({ admissions: [world().admissions[0], { ...world().admissions[0], id: ADM2, party_size: 10 }] }), calls);
  const res = await deliverTicketsForOrder(admin, { tenantId: T, orderId: ORDER });
  assert.deepEqual(res, { ok: true, sent: 2, skipped: 0 });
  const stamp = calls.filter((c) => c.table === "admissions" && c.op === "update").at(-1)!;
  assert.deepEqual(stamp.filters.find(([c]) => c === "id")?.[2], [ADM, ADM2]);
});

test("a cancelled admission is never delivered", async () => {
  const calls: Call[] = [];
  const admin = fakeAdmin(world({ admissions: [{ ...world().admissions[0], status: "cancelled" }] }), calls);
  const res = await deliverTicketForAdmission(admin, { tenantId: T, admissionId: ADM });
  // Nothing claimable → nothing sent. Reported as "skipped", not as an error:
  // the caller (a webhook retry, a desk tap) has nothing to do about it.
  assert.deepEqual(res, { ok: true, sent: 0, skipped: 1 });
  assert.ok(!calls.some((c) => c.table === "admissions" && c.op === "update" && /sent_at/.test(JSON.stringify(c.payload))));
});
