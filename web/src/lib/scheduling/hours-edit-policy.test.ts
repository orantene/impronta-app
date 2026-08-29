import { strict as assert } from "node:assert";
import { test } from "node:test";

import { actorMayWriteHours, staffMayWriteHours } from "./hours-edit-policy";

test("staff may write resource and unclaimed profiles only", () => {
  assert.equal(staffMayWriteHours({ profileKind: "resource", userId: null }), true);
  assert.equal(staffMayWriteHours({ profileKind: "person", userId: null }), true);
  assert.equal(staffMayWriteHours({ profileKind: "person", userId: "u1" }), false);
});

test("claimed talent always edits their own hours", () => {
  assert.equal(
    actorMayWriteHours(
      { isOwner: true, isStaff: false },
      { profileKind: "person", userId: "u1" },
    ),
    true,
  );
});

test("staff of a claimed trainer is read-only", () => {
  assert.equal(
    actorMayWriteHours(
      { isOwner: false, isStaff: true },
      { profileKind: "person", userId: "trainer" },
    ),
    false,
  );
});
