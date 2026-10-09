import assert from "node:assert/strict";
import { test } from "node:test";

import {
  firstSendPlan,
  shouldMarkPromotedAfterFirstDelivery,
} from "./retry-same-inquiry";

test("a second tap stays on the same inquiry", () => {
  assert.equal(firstSendPlan(null, false), "start");
  const created = "inq-1";
  assert.equal(firstSendPlan(created, false), "continue");
  assert.equal(firstSendPlan(created, true), "reply");
  assert.notEqual(firstSendPlan(created, false), "start");
  assert.notEqual(firstSendPlan(created, true), "start");
});

test("TUL-458: after first delivery, mark promoted so the next send is reply", () => {
  const created = "inq-hub-1";
  assert.equal(shouldMarkPromotedAfterFirstDelivery(null), false);
  assert.equal(shouldMarkPromotedAfterFirstDelivery(created), true);
  // Simulate the panel flipping contactPromoted after onSent / first delivery.
  assert.equal(firstSendPlan(created, true), "reply");
  assert.notEqual(
    firstSendPlan(created, false),
    "reply",
    "without the flip, the second message wrongly stays on continue",
  );
});
