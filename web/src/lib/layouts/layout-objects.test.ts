import { test } from "node:test";
import assert from "node:assert/strict";
import { bookableMarkerCount, planSeatRelocation } from "./layout-objects";

test("bookable markers count capacity units", () => {
  assert.equal(
    bookableMarkerCount({
      id: "v1",
      spaceId: "s1",
      name: "Main",
      active: true,
      objects: [
        { id: "a", role: "visual_only", label: "Plant", x: 0, y: 0 },
        { id: "b", role: "capacity_marker", label: "Seat 1", x: 1, y: 1, capacityUnits: 1 },
        { id: "c", role: "bookable_resource", label: "Table", x: 2, y: 2, capacityUnits: 4 },
      ],
    }),
    5,
  );
});

test("relocation refuses when not enough markers remain", () => {
  const r = planSeatRelocation({
    removedObjectId: "gone",
    remainingMarkers: [{ id: "b", role: "capacity_marker", label: "Seat", x: 0, y: 0 }],
    admissionIds: ["a1", "a2"],
  });
  assert.equal(r.ok, false);
});
