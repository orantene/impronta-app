import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadSalesByItem } from "./sales-by-item";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** A just-enough PostgREST fake: select/eq/in/gte/lt/order/range over in-memory rows. */
function fakeClient(tables: Tables, failOn?: string): SupabaseClient {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let range: [number, number] | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
      in: (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), q),
      gte: (c: string, v: string) => ((rows = rows.filter((r) => String(r[c]) >= v)), q),
      lt: (c: string, v: string) => ((rows = rows.filter((r) => String(r[c]) < v)), q),
      order: () => q,
      range: (a: number, b: number) => ((range = [a, b]), q),
      then: (ok: (v: unknown) => unknown) => {
        if (failOn === table) return Promise.resolve({ data: null, error: { message: "boom" } }).then(ok);
        const out = range ? rows.slice(range[0], range[1] + 1) : rows;
        return Promise.resolve({ data: out, error: null }).then(ok);
      },
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const T = "tenant-1";
const orders: Row[] = [
  { id: "o1", tenant_id: T, status: "paid", currency: "USD", created_at: "2026-10-14T10:00:00Z" },
  { id: "o2", tenant_id: T, status: "fulfilled", currency: "USD", created_at: "2026-10-15T10:00:00Z" },
  { id: "o3", tenant_id: T, status: "pending_payment", currency: "USD", created_at: "2026-10-15T11:00:00Z" },
  { id: "o4", tenant_id: T, status: "refunded", currency: "USD", created_at: "2026-10-15T12:00:00Z" },
  { id: "x1", tenant_id: "tenant-2", status: "paid", currency: "USD", created_at: "2026-10-15T10:00:00Z" },
];
const lines: Row[] = [
  { id: "l1", tenant_id: T, order_id: "o1", offering_id: "off-a", label: "Haircut", units: 1, total_cents: 3000, refunded_cents: 0 },
  { id: "l2", tenant_id: T, order_id: "o2", offering_id: "off-a", label: "Haircut", units: 2, total_cents: 6000, refunded_cents: 0 },
  { id: "l3", tenant_id: T, order_id: "o3", offering_id: "off-a", label: "Haircut", units: 5, total_cents: 15000, refunded_cents: 0 },
  { id: "l4", tenant_id: T, order_id: "o4", offering_id: "off-a", label: "Haircut", units: 1, total_cents: 3000, refunded_cents: 3000 },
  { id: "l5", tenant_id: "tenant-2", order_id: "x1", offering_id: "off-a", label: "Haircut", units: 9, total_cents: 99900, refunded_cents: 0 },
];
const tx: Row[] = [
  { id: "t1", order_id: "o1", provider: "manual", metadata: { paid_via: "cash" }, status: "paid", refund_of_transaction_id: null },
  { id: "t2", order_id: "o2", provider: "stripe", metadata: {}, status: "paid", refund_of_transaction_id: null },
  { id: "t4", order_id: "o4", provider: "stripe", metadata: {}, status: "paid", refund_of_transaction_id: null },
];

test("aggregates two paid orders of one offering; unpaid and other-tenant orders are excluded; refunds net out", async () => {
  const res = await loadSalesByItem(T, {}, fakeClient({ orders, order_lines: lines, booking_transactions: tx }));
  assert.ok(res.ok);
  assert.equal(res.rows.length, 1);
  const r = res.rows[0];
  assert.equal(r.quantity, 4); // 1 + 2 + 1 (refunded order still counted as sold, then netted)
  assert.equal(r.grossCents, 12000);
  assert.equal(r.refundedCents, 3000);
  assert.equal(r.netCents, 9000);
  assert.equal(r.orderCount, 3);
});

test("the period filter changes the result set", async () => {
  const c = fakeClient({ orders, order_lines: lines, booking_transactions: tx });
  const all = await loadSalesByItem(T, {}, c);
  const today = await loadSalesByItem(T, { range: { from: "2026-10-15T00:00:00.000Z", to: null } }, c);
  assert.ok(all.ok && today.ok);
  assert.equal(all.rows[0].orderCount, 3);
  assert.equal(today.rows[0].orderCount, 2);
  assert.equal(today.rows[0].grossCents, 9000);
});

test("the payment-method filter changes the result set", async () => {
  const c = fakeClient({ orders, order_lines: lines, booking_transactions: tx });
  const cash = await loadSalesByItem(T, { method: "cash" }, c);
  const online = await loadSalesByItem(T, { method: "online" }, c);
  assert.ok(cash.ok && online.ok);
  assert.equal(cash.rows[0].grossCents, 3000);
  assert.equal(online.rows[0].grossCents, 9000);
  const none = await loadSalesByItem(T, { method: "card" }, c);
  assert.ok(none.ok);
  assert.deepEqual(none.rows, []);
});

test("a read error is a failed load, not an empty table", async () => {
  for (const table of ["orders", "order_lines", "booking_transactions"]) {
    const res = await loadSalesByItem(T, { method: "cash" }, fakeClient({ orders, order_lines: lines, booking_transactions: tx }, table));
    assert.equal(res.ok, false, table);
  }
});

test("amounts-unchanged proof: the loader only reads, and the stored rows are byte-identical after", async () => {
  const before = JSON.stringify({ orders, lines, tx });
  await loadSalesByItem(T, { method: "online" }, fakeClient({ orders, order_lines: lines, booking_transactions: tx }));
  assert.equal(JSON.stringify({ orders, lines, tx }), before);
});
