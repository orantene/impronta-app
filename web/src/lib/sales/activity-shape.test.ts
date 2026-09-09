import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SALES_TYPE_CHIPS,
  salesMoneyPresentation,
  salesSourceHref,
  filterSalesRows,
} from "./activity-shape";

test("type chips cover the cross-product kinds", () => {
  assert.ok(SALES_TYPE_CHIPS.includes("admission"));
  assert.ok(SALES_TYPE_CHIPS.includes("project"));
  assert.ok(SALES_TYPE_CHIPS.includes("appointment"));
});

test("free registration never presents as unpaid", () => {
  const r = salesMoneyPresentation({
    kind: "registration",
    totalCents: 0,
    status: "confirmed",
  });
  assert.equal(r.treatAsFree, true);
  assert.equal(r.amountDueLabel, "Free");
});

test("source link prefers an absolute path", () => {
  assert.equal(
    salesSourceHref({ tenantSlug: "acme", kind: "order", sourcePath: "orders/o1" }),
    "/acme/admin/orders/o1",
  );
});

test("filter keeps kind chips honest", () => {
  const rows = filterSalesRows(
    [{ kind: "order" }, { kind: "registration" }, { kind: "admission" }],
    "registration",
  );
  assert.deepEqual(rows, [{ kind: "registration" }]);
});
