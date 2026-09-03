/**
 * The TypeScript half of the capacity rule must agree with the SQL half.
 * These cases mirror, one for one, the assertions the migration was proven
 * against in production (rolled back, zero residue) before it shipped.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chargesAgainst,
  isAllocationLive,
  overlapsWindow,
  remainingAcrossChain,
  remainingUnits,
} from "./remaining";
import type { CapacityAllocation, CapacityPool } from "./types";

const NOW = new Date("2027-01-10T12:00:00Z");
const W = { startsAt: "2027-01-10T19:00:00Z", endsAt: "2027-01-10T21:00:00Z" };
const NEXT = { startsAt: "2027-01-10T21:00:00Z", endsAt: "2027-01-10T23:00:00Z" };
const TIMELESS = { startsAt: null, endsAt: null };

function pool(over: Partial<CapacityPool> = {}): CapacityPool {
  return {
    id: "pool-1",
    tenantId: "t1",
    subjectKind: "offering",
    subjectId: "s1",
    poolKey: "default",
    parentPoolId: null,
    poolPath: ["pool-1"],
    unitsTotal: 12,
    overbookUnits: 0,
    holdTtlSeconds: 900,
    unitLabel: null,
    isActive: true,
    ...over,
  };
}

function alloc(over: Partial<CapacityAllocation> = {}): CapacityAllocation {
  return {
    id: "a1",
    poolId: "pool-1",
    poolPath: ["pool-1"],
    orderLineId: null,
    startsAt: null,
    endsAt: null,
    units: 1,
    state: "committed",
    expiresAt: null,
    ...over,
  };
}

test("an empty pool is entirely available", () => {
  assert.equal(remainingUnits(pool(), []), 12);
});

test("committed units are consumed; the 13th of 12 leaves nothing", () => {
  const held = Array.from({ length: 12 }, (_, i) => alloc({ id: `a${i}` }));
  assert.equal(remainingUnits(pool(), held), 0);
});

test("overbook_units raises the ceiling without changing units_total", () => {
  const held = Array.from({ length: 12 }, (_, i) => alloc({ id: `a${i}` }));
  assert.equal(remainingUnits(pool({ overbookUnits: 2 }), held), 2);
});

test("a lapsed hold stops consuming; a live hold keeps consuming", () => {
  const lapsed = alloc({ state: "hold", expiresAt: "2027-01-10T11:00:00Z", units: 5 });
  const live = alloc({ id: "a2", state: "hold", expiresAt: "2027-01-10T13:00:00Z", units: 5 });
  assert.equal(isAllocationLive(lapsed, NOW), false);
  assert.equal(isAllocationLive(live, NOW), true);
  assert.equal(remainingUnits(pool(), [lapsed, live], TIMELESS, NOW), 7);
});

test("a released allocation never consumes, whatever its expiry says", () => {
  const released = alloc({ state: "released", units: 5, expiresAt: "2099-01-01T00:00:00Z" });
  assert.equal(remainingUnits(pool(), [released], TIMELESS, NOW), 12);
});

test("a hold with no expiry is not live — the state machine requires one", () => {
  assert.equal(isAllocationLive(alloc({ state: "hold", expiresAt: null }), NOW), false);
});

test("half-open windows: 19:00-21:00 and 21:00-23:00 do not collide", () => {
  const evening = alloc({ startsAt: W.startsAt, endsAt: W.endsAt });
  assert.equal(overlapsWindow(evening, NEXT), false);
  assert.equal(overlapsWindow(evening, W), true);
  assert.equal(remainingUnits(pool({ unitsTotal: 1 }), [evening], NEXT, NOW), 1);
  assert.equal(remainingUnits(pool({ unitsTotal: 1 }), [evening], W, NOW), 0);
});

test("timeless stock counts against every window, and vice versa", () => {
  const stock = alloc({ units: 3 });
  assert.equal(overlapsWindow(stock, W), true);
  const windowed = alloc({ startsAt: W.startsAt, endsAt: W.endsAt, units: 3 });
  assert.equal(overlapsWindow(windowed, TIMELESS), true);
});

test("an inactive pool is unavailable regardless of its allocations", () => {
  assert.equal(remainingUnits(pool({ isActive: false }), []), 0);
});

test("a child's allocations charge every ancestor", () => {
  const room = pool({ id: "room", poolPath: ["room"], unitsTotal: 4 });
  const table = pool({ id: "table", parentPoolId: "room", poolPath: ["room", "table"], unitsTotal: 10 });
  const seated = alloc({ poolId: "table", poolPath: ["room", "table"], units: 3, startsAt: W.startsAt, endsAt: W.endsAt });
  assert.equal(chargesAgainst(seated, "room"), true);
  assert.equal(chargesAgainst(seated, "table"), true);
  assert.equal(remainingUnits(room, [seated], W, NOW), 1);
  assert.equal(remainingUnits(table, [seated], W, NOW), 7);
});

test("a room buy-out leaves an empty table unbookable", () => {
  const room = pool({ id: "room", poolPath: ["room"], unitsTotal: 4 });
  const table = pool({ id: "table", parentPoolId: "room", poolPath: ["room", "table"], unitsTotal: 10 });
  const buyout = alloc({ poolId: "room", poolPath: ["room"], units: 4, startsAt: W.startsAt, endsAt: W.endsAt });
  // The table itself still reports ten free seats...
  assert.equal(remainingUnits(table, [buyout], W, NOW), 10);
  // ...but nobody can sit at it, which is the answer the chain gives.
  assert.equal(remainingAcrossChain([room, table], [buyout], W, NOW), 0);
  // A different service window is untouched.
  assert.equal(remainingAcrossChain([room, table], [buyout], NEXT, NOW), 4);
});

test("an allocation on a sibling branch does not charge this pool", () => {
  const table = pool({ id: "table", poolPath: ["room", "table"] });
  const elsewhere = alloc({ poolId: "other", poolPath: ["room", "other"], units: 9 });
  assert.equal(remainingUnits(table, [elsewhere], TIMELESS, NOW), 12);
});

test("remaining never goes negative", () => {
  const over = alloc({ units: 99 });
  assert.equal(remainingUnits(pool({ unitsTotal: 1 }), [over], TIMELESS, NOW), 0);
});

test("an unparseable timestamp is treated as overlapping, never as free", () => {
  const junk = alloc({ startsAt: "not-a-date", endsAt: "also-not", units: 12 });
  assert.equal(overlapsWindow(junk, W), true);
  assert.equal(remainingUnits(pool(), [junk], W, NOW), 0);
});

test("an empty chain is unavailable rather than unlimited", () => {
  assert.equal(remainingAcrossChain([], [], TIMELESS, NOW), 0);
});
