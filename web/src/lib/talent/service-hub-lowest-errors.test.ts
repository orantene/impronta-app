import assert from "node:assert/strict";
import test from "node:test";

import { classifyLowestError } from "./service-hub-lowest-errors";
import { channelCopy } from "./service-hub-channels";

test("below_floor is its own reason and carries the floor amount", () => {
  assert.deepEqual(classifyLowestError({ code: "23514", message: "below_floor", details: "12500" }), { reason: "below_floor", floorCents: 12500 });
  assert.deepEqual(classifyLowestError({ code: "23514", message: "below_floor", details: "not a number" }), { reason: "below_floor", floorCents: null });
  assert.deepEqual(classifyLowestError({ code: "23514", message: "below_floor", details: null }), { reason: "below_floor", floorCents: null });
});

test("other check failures stay 'invalid'; ownership, missing function and the rest map as before", () => {
  assert.deepEqual(classifyLowestError({ code: "23514", message: "listing_not_active" }), { reason: "invalid" });
  assert.deepEqual(classifyLowestError({ code: "22023", message: "invalid_amount" }), { reason: "invalid" });
  assert.deepEqual(classifyLowestError({ code: "42501", message: "not allowed" }), { reason: "not_allowed" });
  for (const code of ["PGRST202", "42883", "55000"]) assert.deepEqual(classifyLowestError({ code, message: "x" }), { reason: "not_ready" });
  assert.deepEqual(classifyLowestError({ code: "XX000", message: "boom" }), { reason: "unavailable" });
});

test("the below-floor sentence names the fix and the amount slot, in both languages", () => {
  for (const l of ["en", "es"]) {
    const t = channelCopy(l).aboveListing;
    assert.ok(t.includes("{floor}"));
    assert.ok(!t.includes("—"));
  }
  assert.match(channelCopy("en").aboveListing, /lower minimum.*raise its price/);
});
