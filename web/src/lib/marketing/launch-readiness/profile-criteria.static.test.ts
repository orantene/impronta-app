import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROFILE_READINESS_CRITERIA,
  unverifiedWithDirectory,
} from "./profile-criteria";

/**
 * This half was written WITHOUT Directory, from measured numbers in their own
 * audit rather than from my judgement. These tests keep that honest: the
 * unverified flag has to stay visible until they actually agree, and the
 * criteria have to stay tied to what profiles measurably fail on rather than
 * drifting into a wishlist.
 */

test("every criterion is honest about not being agreed yet", () => {
  for (const c of PROFILE_READINESS_CRITERIA) {
    assert.equal(
      typeof c.verifiedWithDirectory,
      "boolean",
      `${c.key}: the flag must exist. Silently dropping it would make an ` +
        `unreviewed criterion look ratified.`,
    );
  }
  // Not asserting they are all false: the goal is for Directory to flip them.
  // This just proves the flag is carried rather than quietly removed.
});

test("the unverified list is derivable, so nobody has to remember", () => {
  const pending = unverifiedWithDirectory();
  const expected = PROFILE_READINESS_CRITERIA.filter((c) => !c.verifiedWithDirectory);
  assert.deepEqual(pending, expected);
});

test("every criterion cites how many profiles actually failed it", () => {
  for (const c of PROFILE_READINESS_CRITERIA) {
    assert.ok(
      Number.isInteger(c.failingAtAudit) && c.failingAtAudit > 0,
      `${c.key}: no measured failure count. This list is ordered by what ` +
        `profiles really fail on, not by what feels important.`,
    );
    assert.ok(
      c.failingAtAudit <= 78,
      `${c.key}: more failures than the 78 listed profiles measured. Someone ` +
        `has changed a number without re-measuring.`,
    );
  }
});

test("the list stays ordered by measured failure rate", () => {
  const counts = PROFILE_READINESS_CRITERIA.map((c) => c.failingAtAudit);
  const sorted = [...counts].sort((a, b) => b - a);
  assert.deepEqual(
    counts,
    sorted,
    "Order by how often profiles fail, so the first thing a talent is asked " +
      "for is the thing most of them are missing.",
  );
});

test("both languages, and no em dashes", () => {
  for (const c of PROFILE_READINESS_CRITERIA) {
    for (const side of [c.en, c.es]) {
      assert.ok(side.label.trim() && side.stillNeeds.trim(), `${c.key}: missing copy`);
    }
    const blob = JSON.stringify([c.en, c.es]);
    assert.ok(!blob.includes("—") && !blob.includes("–"), `${c.key}: dash in copy`);
  }
});
