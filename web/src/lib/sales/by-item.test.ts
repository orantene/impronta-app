import { test } from "node:test";
import assert from "node:assert/strict";

import { aggregateSalesByItem, SALES_ITEM_ORDER_STATUSES, type ItemLine, type ItemOrder } from "./by-item";

const order = (id: string, status: string, currency = "USD", createdAt = "2026-10-10T12:00:00Z"): ItemOrder => ({
  id,
  status,
  currency,
  createdAt,
});
const line = (orderId: string, offeringId: string | null, label: string, units: number, totalCents: number, refundedCents = 0): ItemLine => ({
  orderId,
  offeringId,
  label,
  units,
  totalCents,
  refundedCents,
});

test("two paid orders of the same offering collapse into one row", () => {
  const rows = aggregateSalesByItem(
    [line("o1", "off-a", "Haircut", 1, 3000), line("o2", "off-a", "Haircut", 2, 6000), line("o2", "off-b", "Beard", 1, 1500)],
    [order("o1", "paid"), order("o2", "fulfilled")],
  );
  const a = rows.find((r) => r.offeringId === "off-a");
  assert.ok(a);
  assert.equal(a.quantity, 3);
  assert.equal(a.grossCents, 9000);
  assert.equal(a.refundedCents, 0);
  assert.equal(a.netCents, 9000);
  assert.equal(a.orderCount, 2);
  assert.equal(rows.length, 2);
});

test("unpaid, draft, cancelled and unknown-order lines never count", () => {
  const rows = aggregateSalesByItem(
    [
      line("o1", "off-a", "Haircut", 1, 3000),
      line("o2", "off-a", "Haircut", 1, 3000),
      line("o3", "off-a", "Haircut", 1, 3000),
      line("o4", "off-a", "Haircut", 1, 3000),
      line("other-tenant", "off-a", "Haircut", 9, 99900),
    ],
    [order("o1", "pending_payment"), order("o2", "draft"), order("o3", "cancelled"), order("o4", "quoted")],
  );
  assert.deepEqual(rows, []);
  assert.ok(!SALES_ITEM_ORDER_STATUSES.includes("pending_payment"));
});

test("refunds net out of the row and never go below the stored lines", () => {
  const rows = aggregateSalesByItem(
    [line("o1", "off-a", "Haircut", 2, 6000, 3000), line("o2", "off-a", "Haircut", 1, 3000, 3000)],
    [order("o1", "partially_refunded"), order("o2", "refunded")],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].grossCents, 9000);
  assert.equal(rows[0].refundedCents, 6000);
  assert.equal(rows[0].netCents, 3000);
});

test("one currency per row: the same offering in two currencies is two rows, never summed", () => {
  const rows = aggregateSalesByItem(
    [line("o1", "off-a", "Haircut", 1, 3000), line("o2", "off-a", "Haircut", 1, 50000)],
    [order("o1", "paid", "USD"), order("o2", "paid", "MXN")],
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.currency).sort(), ["MXN", "USD"]);
  for (const r of rows) assert.equal(r.quantity, 1);
});

test("lines with no offering group by their own label, apart from real offerings", () => {
  const rows = aggregateSalesByItem(
    [line("o1", null, "Tip", 1, 500), line("o2", null, "Tip", 1, 700), line("o2", null, "Delivery", 1, 300), line("o1", "off-a", "Tip", 1, 100)],
    [order("o1", "paid"), order("o2", "paid")],
  );
  const tip = rows.find((r) => r.offeringId === null && r.title === "Tip");
  assert.ok(tip);
  assert.equal(tip.grossCents, 1200);
  assert.equal(rows.length, 3);
});

test("rows sort by currency, then net descending, then title", () => {
  const rows = aggregateSalesByItem(
    [line("o1", "a", "Alpha", 1, 100), line("o1", "b", "Beta", 1, 900), line("o1", "c", "Gamma", 1, 900)],
    [order("o1", "paid")],
  );
  assert.deepEqual(rows.map((r) => r.title), ["Beta", "Gamma", "Alpha"]);
});

test("the aggregator never mutates the stored lines or orders (amounts-unchanged proof)", () => {
  const lines = [line("o1", "off-a", "Haircut", 2, 6000, 1000)];
  const orders = [order("o1", "paid")];
  const before = JSON.stringify({ lines, orders });
  aggregateSalesByItem(lines, orders);
  assert.equal(JSON.stringify({ lines, orders }), before);
});
