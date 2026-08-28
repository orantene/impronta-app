import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dispatchLogPatchFromHandlerResult,
  dispatchLogPatchFromThrown,
  SKIPPED_DISPATCH_ERROR,
} from "./dispatcher-outcome";

test("handler null → row skipped", () => {
  const patch = dispatchLogPatchFromHandlerResult(null);
  assert.equal(patch.status, "skipped");
  assert.equal(patch.provider_reference, null);
  assert.equal(patch.error_message, SKIPPED_DISPATCH_ERROR);
});

test("handler throw → row failed", () => {
  const patch = dispatchLogPatchFromThrown(new Error("smtp down"));
  assert.equal(patch.status, "failed");
  assert.equal(patch.error_message, "smtp down");
});

test("handler ref → row sent", () => {
  const patch = dispatchLogPatchFromHandlerResult("re_abc");
  assert.equal(patch.status, "sent");
  assert.equal(patch.provider_reference, "re_abc");
  assert.equal(patch.error_message, null);
  assert.ok(patch.sent_at);
});
