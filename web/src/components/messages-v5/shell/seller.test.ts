import assert from "node:assert/strict";
import { test } from "node:test";

import { quoteSummary, sellerMenuItems } from "./seller";

test("seller menu keeps only actions a talent can run", () => {
  const items = [{ id: "rename" }, { id: "handover" }, { id: "copy_link" }, { id: "history" }, { id: "close_lost" }];
  assert.deepEqual(sellerMenuItems(items, true), [{ id: "copy_link" }]);
  assert.equal(sellerMenuItems(items, false).length, 5);
});

test("quote summary splits deposit and balance", () => {
  assert.deepEqual(quoteSummary(115000, 30000), { totalCents: 115000, depositCents: 30000, balanceCents: 85000 });
  assert.deepEqual(quoteSummary(115000, null), { totalCents: 115000, depositCents: null, balanceCents: null });
  assert.deepEqual(quoteSummary(115000, 0), { totalCents: 115000, depositCents: null, balanceCents: null });
  assert.deepEqual(quoteSummary(10000, 20000), { totalCents: 10000, depositCents: 10000, balanceCents: 0 });
});
