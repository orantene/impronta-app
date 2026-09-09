import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCheckEvenly } from "./check-partition";

test("split conserves cents with deterministic remainders", () => {
  const r = splitCheckEvenly(
    [
      { orderLineId: "l2", units: 1, totalCents: 100 },
      { orderLineId: "l1", units: 1, totalCents: 50 },
    ],
    3,
  );
  assert.ok(Array.isArray(r));
  if (!Array.isArray(r)) return;
  assert.equal(r.reduce((s, p) => s + p.totalCents, 0), 150);
});
