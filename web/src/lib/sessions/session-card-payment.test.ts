/**
 * [MONEY] session picker card hop: startSessionCardPayment may only charge a
 * transaction that belongs to THIS tenant's order. A transaction from another
 * order or another tenant is refused before Stripe is ever reached.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { resolveSessionCardPayment } from "./session-card-payment";

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), q),
      limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return q;
  }
  return { from: (t: string) => query(t) } as never;
}

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const O1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const O2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const X1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const X2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OFF = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const TABLES = {
  orders: [
    { id: O1, tenant_id: T1, status: "pending_payment", receipt_code: "R1", currency: "MXN", customer_id: null },
    { id: O2, tenant_id: T2, status: "pending_payment", receipt_code: "R2", currency: "USD", customer_id: null },
  ],
  booking_transactions: [
    { id: X1, order_id: O1, booking_id: "bk1", source_inquiry_id: null, gross_amount_cents: 45000, status: "pending" },
    { id: X2, order_id: O2, booking_id: "bk2", source_inquiry_id: null, gross_amount_cents: 9000, status: "pending" },
  ],
  order_lines: [{ order_id: O1, offering_id: OFF }],
  talent_offerings: [{ id: OFF, tenant_id: T1, title: "Pottery night" }],
};

test("the right tenant, order and transaction resolve, with the offering title as description", async () => {
  const r = await resolveSessionCardPayment(fakeAdmin(TABLES), { tenantId: T1, orderId: O1, transactionId: X1 });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.amountCents, 45000);
    assert.equal(r.currency, "MXN");
    assert.equal(r.description, "Pottery night");
    assert.equal(r.receiptCode, "R1");
  }
});

test("a transaction from ANOTHER ORDER is refused", async () => {
  const r = await resolveSessionCardPayment(fakeAdmin(TABLES), { tenantId: T1, orderId: O1, transactionId: X2 });
  assert.deepEqual(r, { ok: false, reason: "not_found" });
});

test("an order from ANOTHER TENANT is refused, even with its own transaction", async () => {
  const r = await resolveSessionCardPayment(fakeAdmin(TABLES), { tenantId: T1, orderId: O2, transactionId: X2 });
  assert.deepEqual(r, { ok: false, reason: "not_found" });
});

test("an order that is already paid is not charged again", async () => {
  const paid = { ...TABLES, orders: [{ ...TABLES.orders[0], status: "paid" }] };
  const r = await resolveSessionCardPayment(fakeAdmin(paid), { tenantId: T1, orderId: O1, transactionId: X1 });
  assert.deepEqual(r, { ok: false, reason: "not_found" });
});

test("a zero-amount transaction never opens checkout", async () => {
  const zero = { ...TABLES, booking_transactions: [{ ...TABLES.booking_transactions[0], gross_amount_cents: 0 }] };
  const r = await resolveSessionCardPayment(fakeAdmin(zero), { tenantId: T1, orderId: O1, transactionId: X1 });
  assert.deepEqual(r, { ok: false, reason: "not_found" });
});

test("the action uses the tenant-checked resolver, the guest's own page for cancel, and the offering title", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/_sessions/session-picker-actions.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function startSessionCardPayment"));
  assert.match(fn, /resolveSessionCardPayment\(admin,/);
  assert.match(fn, /createCheckoutSessionForTransaction\(/);
  assert.match(fn, /successUrl: `\$\{origin\}\/r\/\$\{[a-zA-Z.]+receiptCode\}\?paid=1`/);
  assert.doesNotMatch(fn, /\/events/);
  assert.match(fn, /description: [a-zA-Z.]*description/);
  assert.match(fn, /cancelUrl/);
});
