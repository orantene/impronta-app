import { test } from "node:test";
import assert from "node:assert/strict";
import { customerMatchesSegment, describeSegmentRule, loyaltyTierFromRollups } from "./segments";

test("segment rules are human-readable", () => {
  assert.match(describeSegmentRule({ field: "visits", op: ">=", value: 3 }), /Visits/);
});

test("loyalty reads rollups only", () => {
  assert.equal(loyaltyTierFromRollups({ visits: 5, spendCents: 0 }), "regular");
  assert.equal(
    customerMatchesSegment(
      { visits: 5, spendCents: 100, tags: ["vip"] },
      [{ field: "tag", op: "has", value: "vip" }],
    ),
    true,
  );
});
