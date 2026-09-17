import assert from "node:assert/strict";
import { test } from "node:test";

import { priceDrift } from "./price-drift";

test("a catalog change after the add is reported, not applied (D-MSG-30)", () => {
  const drift = priceDrift({ priceSnapshotCents: 1800, unitCents: 1800 }, 2100);
  assert.equal(drift.drifted, true);
  if (!drift.drifted) return;
  assert.equal(drift.snapshotCents, 1800);
  assert.equal(drift.catalogNowCents, 2100);
  assert.equal(drift.deltaCents, 300);
});

test("a catalog that went down drifts with a negative delta", () => {
  const drift = priceDrift({ priceSnapshotCents: 1800, unitCents: 1800 }, 1500);
  assert.equal(drift.drifted, true);
  if (drift.drifted) assert.equal(drift.deltaCents, -300);
});

test("same price is no drift", () => {
  assert.deepEqual(priceDrift({ priceSnapshotCents: 1800, unitCents: 1800 }, 1800), {
    drifted: false,
    snapshotCents: 1800,
    catalogNowCents: 1800,
  });
});

test("a missing catalog price is a missing item, not a drift", () => {
  assert.deepEqual(priceDrift({ priceSnapshotCents: 1800, unitCents: 1800 }, null), {
    drifted: false,
    snapshotCents: 1800,
    catalogNowCents: null,
  });
  assert.equal(priceDrift({ priceSnapshotCents: 1800, unitCents: 1800 }, Number.NaN).drifted, false);
});

test("a pre-S5 line with no snapshot is compared on the price it charges", () => {
  const drift = priceDrift({ priceSnapshotCents: null, unitCents: 1800 }, 1900);
  assert.equal(drift.drifted, true);
  assert.equal(drift.snapshotCents, 1800);
});

test("the catalog stamp, not the phase price, is the reference", () => {
  // A phase priced the line at 1500 while the catalog said 1800; the catalog
  // still says 1800, so nothing drifted for this line.
  const drift = priceDrift({ catalogPriceCentsAtAdd: 1800, priceSnapshotCents: 1500, unitCents: 1500 }, 1800);
  assert.equal(drift.drifted, false);
  // ...and when the catalog moves, the delta is against the catalog stamp.
  const moved = priceDrift({ catalogPriceCentsAtAdd: 1800, priceSnapshotCents: 1500, unitCents: 1500 }, 2000);
  assert.equal(moved.drifted, true);
  if (moved.drifted) assert.equal(moved.deltaCents, 200);
});
