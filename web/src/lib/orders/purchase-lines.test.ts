import assert from "node:assert/strict";
import { test } from "node:test";
import { withOfferingStockNeeds } from "@/lib/orders/purchase-stock";
import { buildCapacityRequests } from "@/lib/orders/capacity-requests";
import { buildOrderLineRows, indexInsertedLines } from "@/lib/orders/purchase-lines";
import type { PricedLine } from "@/lib/orders/purchase-pricing";

const line = (over: Partial<PricedLine>): PricedLine => ({
  offeringId: "off_1", variantId: null, addonIds: [], label: "Ticket", units: 1, unitCents: 5000, totalCents: 5000,
  talentProfileId: null, ownerTenantId: "t1", talentCostCents: 0, ...over,
});

test("TUL-1314: one order, two variants of one stock-limited offering: each hold names its own line", () => {
  const lines = [
    { offeringId: "off_1", units: 2 }, // variant A
    { offeringId: "off_1", units: 3 }, // variant B
  ];
  const needs = withOfferingStockNeeds([], lines, new Map([["off_1", "pool_1"]]));
  assert.deepEqual(needs.map((n) => n.lineIndex), [0, 1]);
  const ids = indexInsertedLines([
    { id: "lineA", offering_id: "off_1", sort_order: 0 },
    { id: "lineB", offering_id: "off_1", sort_order: 1 },
  ]);
  const r = buildCapacityRequests(needs, ids.byOffering, ids.byIndex);
  assert.deepEqual(r.ok && r.requests.map((q) => [q.orderLineId, q.units]), [["lineA", 2], ["lineB", 3]]);
});

test("TUL-1302: the phase id is written to the order line only when a phase set the price", () => {
  const rows = buildOrderLineRows([line({ pricePhaseId: "ph_1" }), line({})], { orderId: "o1", tenantId: "t1", sessionIds: [null, "s1"] });
  assert.equal(rows[0].price_phase_id, "ph_1");
  assert.equal("price_phase_id" in rows[1], false);
  assert.equal(rows[1].session_id, "s1");
  assert.deepEqual(rows.map((r) => r.sort_order), [0, 1]);
});
