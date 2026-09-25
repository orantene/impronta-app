import assert from "node:assert/strict";
import { test } from "node:test";

import { firstSendPlan } from "./retry-same-inquiry";

test("a second tap stays on the same inquiry", () => {
  assert.equal(firstSendPlan(null, false), "start");
  const created = "inq-1";
  assert.equal(firstSendPlan(created, false), "continue");
  assert.equal(firstSendPlan(created, true), "reply");
  assert.notEqual(firstSendPlan(created, false), "start");
  assert.notEqual(firstSendPlan(created, true), "start");
});
