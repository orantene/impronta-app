import { test } from "node:test";
import assert from "node:assert/strict";

import { inSalesRange, parseSalesMethod, parseSalesPeriod, parseSalesView, salesPeriodRange } from "./period";
import { methodBucket, ordersMatchingMethod } from "./payment-method";

const NOW = new Date("2026-10-15T18:00:00Z"); // Thursday; 13:00 in Cancun (UTC-5)

test("period and method params fall back to the unfiltered default", () => {
  assert.equal(parseSalesPeriod(undefined), "all");
  assert.equal(parseSalesPeriod("nonsense"), "all");
  assert.equal(parseSalesPeriod("7d"), "7d");
  assert.equal(parseSalesMethod("cash"), "cash");
  assert.equal(parseSalesMethod("x"), "any");
  assert.equal(parseSalesView("items"), "items");
  assert.equal(parseSalesView("x"), "activity");
});

test("all time has no bounds; today starts at the workspace's local midnight", () => {
  assert.deepEqual(salesPeriodRange("all", NOW, "America/Cancun"), { from: null, to: null });
  const today = salesPeriodRange("today", NOW, "America/Cancun");
  assert.equal(today.from, "2026-10-15T05:00:00.000Z");
});

test("7d, 30d and month reach back by local calendar days", () => {
  assert.equal(salesPeriodRange("7d", NOW, "America/Cancun").from, "2026-10-09T05:00:00.000Z");
  assert.equal(salesPeriodRange("30d", NOW, "America/Cancun").from, "2026-09-16T05:00:00.000Z");
  assert.equal(salesPeriodRange("month", NOW, "America/Cancun").from, "2026-10-01T05:00:00.000Z");
});

test("an unusable zone falls back to UTC rather than throwing", () => {
  assert.equal(salesPeriodRange("today", NOW, "Not/AZone").from, "2026-10-15T00:00:00.000Z");
});

test("inSalesRange filters a result set (period changes the rows)", () => {
  const rows = [
    { id: "a", createdAt: "2026-10-15T10:00:00Z" },
    { id: "b", createdAt: "2026-10-01T10:00:00Z" },
    { id: "c", createdAt: "2026-08-01T10:00:00Z" },
  ];
  const ids = (p: Parameters<typeof salesPeriodRange>[0]) =>
    rows.filter((r) => inSalesRange(r.createdAt, salesPeriodRange(p, NOW, "UTC"))).map((r) => r.id);
  assert.deepEqual(ids("all"), ["a", "b", "c"]);
  assert.deepEqual(ids("today"), ["a"]);
  assert.deepEqual(ids("month"), ["a", "b"]);
});

test("methodBucket maps providers and the counter tender onto four buckets", () => {
  assert.equal(methodBucket({ provider: "manual", paidVia: "cash" }), "cash");
  assert.equal(methodBucket({ provider: "manual", paidVia: "card" }), "card");
  assert.equal(methodBucket({ provider: "stripe_terminal", paidVia: null }), "card");
  assert.equal(methodBucket({ provider: "stripe", paidVia: null }), "online");
  assert.equal(methodBucket({ provider: "manual", paidVia: null }), "other");
  assert.equal(methodBucket({ provider: "manual_bank", paidVia: null }), "other");
});

test("ordersMatchingMethod keeps orders with a money-status, non-refund tender in the bucket", () => {
  const tx = [
    { order_id: "o1", provider: "manual", metadata: { paid_via: "cash" }, status: "paid", refund_of_transaction_id: null },
    { order_id: "o2", provider: "stripe", metadata: {}, status: "paid", refund_of_transaction_id: null },
    { order_id: "o3", provider: "manual", metadata: { paid_via: "cash" }, status: "failed", refund_of_transaction_id: null },
    { order_id: "o4", provider: "manual", metadata: { paid_via: "cash" }, status: "paid", refund_of_transaction_id: "x" },
  ];
  assert.deepEqual([...ordersMatchingMethod(tx, "cash")].sort(), ["o1"]);
  assert.deepEqual([...(ordersMatchingMethod(tx, "online") ?? [])], ["o2"]);
  assert.equal(ordersMatchingMethod(tx, "any"), null);
});
