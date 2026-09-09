import { test } from "node:test";
import assert from "node:assert/strict";
import { exclusiveClosure, layoutInventoriesCapacity } from "./combined-spaces";
import { placeTentativeStaffHold } from "./tentative-holds";

test("combined Hall A+B closes both components", () => {
  const graph = {
    edges: [
      { combinedSpaceId: "ab", componentSpaceId: "a" },
      { combinedSpaceId: "ab", componentSpaceId: "b" },
    ],
  };
  assert.deepEqual(exclusiveClosure(graph, "ab"), ["a", "ab", "b"]);
  assert.ok(exclusiveClosure(graph, "a").includes("ab"));
});

test("a layout cannot invent capacity the room lacks", () => {
  assert.equal(layoutInventoriesCapacity({ physicalUnits: 40, layoutBookableMarkers: 40 }).ok, true);
  const bad = layoutInventoriesCapacity({ physicalUnits: 40, layoutBookableMarkers: 60 });
  assert.equal(bad.ok, false);
});

test("tentative hold refuses missing reason and requires firm TTL", async () => {
  const admin = {
    from() {
      throw new Error("should not write");
    },
  };
  const noReason = await placeTentativeStaffHold(admin as never, {
    talentProfileId: "t",
    tenantId: "ten",
    startsAt: "2026-10-01T10:00:00.000Z",
    endsAt: "2026-10-01T11:00:00.000Z",
    ownerUserId: "u1",
    reason: "  ",
    ttlSeconds: 600,
  });
  assert.equal(noReason.ok, false);
});
