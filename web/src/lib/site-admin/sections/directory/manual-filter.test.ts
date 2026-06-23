import assert from "node:assert/strict";
import { test } from "node:test";

import { buildManualCodeOrder, filterToManualCodes } from "./manual-filter";

test("buildManualCodeOrder: null when no usable codes", () => {
  assert.equal(buildManualCodeOrder(undefined), null);
  assert.equal(buildManualCodeOrder([]), null);
  assert.equal(buildManualCodeOrder(["", "   "]), null);
});

test("buildManualCodeOrder: trims, de-dupes (first wins), preserves order", () => {
  const order = buildManualCodeOrder([" TAL-2 ", "TAL-1", "TAL-2", ""]);
  assert.ok(order);
  assert.equal(order.get("TAL-2"), 0);
  assert.equal(order.get("TAL-1"), 1);
  assert.equal(order.size, 2);
});

test("filterToManualCodes: null order returns a copy unchanged", () => {
  const cards = [{ profileCode: "TAL-1" }, { profileCode: "TAL-2" }];
  const out = filterToManualCodes(cards, null);
  assert.deepEqual(out, cards);
  assert.notEqual(out, cards); // copy, not the same ref
});

test("filterToManualCodes: keeps only picked codes, sorted into pick order", () => {
  const order = buildManualCodeOrder(["TAL-3", "TAL-1"]);
  const cards = [
    { profileCode: "TAL-1" },
    { profileCode: "TAL-2" }, // not picked → dropped
    { profileCode: "TAL-3" },
  ];
  const out = filterToManualCodes(cards, order);
  assert.deepEqual(
    out.map((c) => c.profileCode),
    ["TAL-3", "TAL-1"],
  );
});

test("filterToManualCodes: de-dupes the fetched set (first occurrence wins)", () => {
  const order = buildManualCodeOrder(["TAL-1"]);
  const cards = [
    { profileCode: "TAL-1", n: 1 },
    { profileCode: "TAL-1", n: 2 },
  ];
  const out = filterToManualCodes(cards, order);
  assert.equal(out.length, 1);
  assert.equal(out[0].n, 1);
});

test("filterToManualCodes: empty when none of the picked codes are present", () => {
  const order = buildManualCodeOrder(["TAL-9"]);
  const cards = [{ profileCode: "TAL-1" }, { profileCode: "TAL-2" }];
  assert.deepEqual(filterToManualCodes(cards, order), []);
});
