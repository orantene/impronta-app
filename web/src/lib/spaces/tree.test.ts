/**
 * SS-1 and SS-2, tested failing-first.
 *
 * Each invariant is proven twice: once on the BROKEN shape, asserting the check
 * reports the violation, and once on the corrected shape, asserting it reports
 * nothing. A test that only passes on a correct fixture proves the fixture, not
 * the guard, and both of these failures are invisible by design — a silent
 * under-count and a double-sold table.
 *
 * The fixture is the shape that actually breaks SS-1: an area AND a section
 * between the room and the table. It only appears once a venue has rooms with
 * areas with tables, which is why it has to be built deliberately.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isPooledKind,
  nearestPooledAncestorId,
  ss1Violations,
  ss2Violations,
  treeIsWellFormed,
  type PoolBinding,
  type SpaceNode,
} from "./tree";

// venue-root(room) > area > section > table > seat
const TREE: SpaceNode[] = [
  { id: "room", kind: "room", parentId: null },
  { id: "area", kind: "area", parentId: "room" },
  { id: "section", kind: "section", parentId: "area" },
  { id: "t7", kind: "table", parentId: "section" },
  { id: "s1", kind: "seat", parentId: "t7" },
  { id: "t8", kind: "table", parentId: "room" }, // a sibling with no levels between
];

test("area and section are the only unpooled kinds", () => {
  assert.equal(isPooledKind("area"), false);
  assert.equal(isPooledKind("section"), false);
  for (const k of ["room", "table", "seat", "cabana", "court", "lane", "bed"] as const) {
    assert.equal(isPooledKind(k), true, `${k} should be pooled`);
  }
});

test("the nearest POOLED ancestor skips the area and the section", () => {
  // The nearest ancestor of t7 is "section". The nearest POOLED one is "room".
  // Confusing the two is the entire bug.
  assert.equal(nearestPooledAncestorId(TREE, "t7"), "room");
  assert.equal(nearestPooledAncestorId(TREE, "s1"), "t7");
  assert.equal(nearestPooledAncestorId(TREE, "room"), null);
});

test("SS-1 FAILS on the skipped-level shape — the silent under-count", () => {
  // t7 points at the venue root's level instead of its room, because someone
  // walked past the area and the section to the top. Nothing in the capacity
  // engine can see this: pool_path is correct by construction for either value.
  const broken: PoolBinding[] = [
    { spaceId: "room", parentPoolSpaceId: null },
    { spaceId: "t7", parentPoolSpaceId: null }, // WRONG: should be "room"
    { spaceId: "t8", parentPoolSpaceId: "room" },
    { spaceId: "s1", parentPoolSpaceId: "t7" },
  ];
  const violations = ss1Violations(TREE, broken);
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0], {
    spaceId: "t7",
    expectedParentSpaceId: "room",
    actualParentSpaceId: null,
    reason: "wrong_ancestor",
  });
});

test("SS-1 PASSES on the corrected shape", () => {
  const correct: PoolBinding[] = [
    { spaceId: "room", parentPoolSpaceId: null },
    { spaceId: "t7", parentPoolSpaceId: "room" },
    { spaceId: "t8", parentPoolSpaceId: "room" },
    { spaceId: "s1", parentPoolSpaceId: "t7" },
  ];
  assert.deepEqual(ss1Violations(TREE, correct), []);
});

test("SS-1 FAILS when an area or section is given a pool", () => {
  const withSectionPool: PoolBinding[] = [
    { spaceId: "room", parentPoolSpaceId: null },
    { spaceId: "section", parentPoolSpaceId: "room" }, // contention for nothing
    { spaceId: "t7", parentPoolSpaceId: "room" },
    { spaceId: "t8", parentPoolSpaceId: "room" },
    { spaceId: "s1", parentPoolSpaceId: "t7" },
  ];
  const violations = ss1Violations(TREE, withSectionPool);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.reason, "unpooled_space_has_pool");
});

test("SS-1 FAILS when a bookable space has no pool at all", () => {
  const missing: PoolBinding[] = [
    { spaceId: "room", parentPoolSpaceId: null },
    { spaceId: "t7", parentPoolSpaceId: "room" },
    { spaceId: "s1", parentPoolSpaceId: "t7" },
    // t8 omitted: a table nobody can book
  ];
  const violations = ss1Violations(TREE, missing);
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0], {
    spaceId: "t8",
    expectedParentSpaceId: "room",
    actualParentSpaceId: null,
    reason: "pooled_space_has_no_pool",
  });
});

test("SS-2 FAILS when a group pool and its members' pools are both live", () => {
  // This is the double-sell: the band sells six four-tops and Table 7 sells
  // directly, because a group pool is not an ancestor of its members.
  const violations = ss2Violations([
    {
      groupId: "four-tops",
      sellMode: "band",
      groupPoolActive: true,
      activeMemberSpaceIds: ["t7"],
    },
  ]);
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0], {
    groupId: "four-tops",
    reason: "both_active",
    activeMemberSpaceIds: ["t7"],
  });
});

test("SS-2 PASSES in band mode: the group has the pool, the members have none", () => {
  assert.deepEqual(
    ss2Violations([
      {
        groupId: "four-tops",
        sellMode: "band",
        groupPoolActive: true,
        activeMemberSpaceIds: [],
      },
    ]),
    [],
  );
});

test("SS-2 PASSES in assigned mode: the members have pools, the group is a selection", () => {
  assert.deepEqual(
    ss2Violations([
      {
        groupId: "four-tops",
        sellMode: "assigned",
        groupPoolActive: false,
        activeMemberSpaceIds: ["t7", "t8"],
      },
    ]),
    [],
  );
});

test("SS-2 FAILS on a band with no pool, which can sell nothing", () => {
  const violations = ss2Violations([
    { groupId: "vip", sellMode: "band", groupPoolActive: false, activeMemberSpaceIds: [] },
  ]);
  assert.equal(violations[0]?.reason, "band_without_pool");
});

test("SS-2 FAILS on a half-finished band to assigned migration", () => {
  // Assigned, but the group pool was never drained and deactivated. This is
  // exactly what step 4 of the migration exists to prevent.
  const violations = ss2Violations([
    { groupId: "vip", sellMode: "assigned", groupPoolActive: true, activeMemberSpaceIds: [] },
  ]);
  assert.equal(violations[0]?.reason, "assigned_with_group_pool");
});

test("overlapping groups are harmless in assigned mode, which is the point", () => {
  // t7 is in four-tops AND window-tables. A pool has one parent, so the group
  // can never BE the parent — but as pure selections, overlap costs nothing.
  assert.deepEqual(
    ss2Violations([
      { groupId: "four-tops", sellMode: "assigned", groupPoolActive: false, activeMemberSpaceIds: ["t7"] },
      { groupId: "window", sellMode: "assigned", groupPoolActive: false, activeMemberSpaceIds: ["t7"] },
    ]),
    [],
  );
});

test("a cycle is reported and terminates rather than looping", () => {
  // The cycle must be made of UNPOOLED nodes to exercise the guard at all: a
  // walk that meets a pooled node stops there and never gets far enough to
  // loop. My first version of this test used two rooms and asserted null,
  // which was wrong — the nearest pooled ancestor of `a` genuinely IS `b`,
  // cycle or not, because the walk answers on the first hop.
  const cyclic: SpaceNode[] = [
    { id: "a", kind: "area", parentId: "b" },
    { id: "b", kind: "section", parentId: "a" },
    { id: "t", kind: "table", parentId: "a" },
  ];
  assert.equal(treeIsWellFormed(cyclic), false);
  assert.equal(nearestPooledAncestorId(cyclic, "t"), null);

  // Two pooled nodes in a cycle still answer on the first hop, which is correct
  // and is worth pinning so nobody "fixes" it into a null.
  const pooledCycle: SpaceNode[] = [
    { id: "a", kind: "room", parentId: "b" },
    { id: "b", kind: "room", parentId: "a" },
  ];
  assert.equal(treeIsWellFormed(pooledCycle), false);
  assert.equal(nearestPooledAncestorId(pooledCycle, "a"), "b");

  const dangling: SpaceNode[] = [{ id: "a", kind: "table", parentId: "ghost" }];
  assert.equal(treeIsWellFormed(dangling), false);
  assert.equal(nearestPooledAncestorId(dangling, "a"), null);

  assert.equal(treeIsWellFormed(TREE), true);
});
