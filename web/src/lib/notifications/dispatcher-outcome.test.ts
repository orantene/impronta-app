import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dispatchLogPatchFromHandlerResult,
  dispatchLogPatchFromThrown,
  isChannelSkip,
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

test("TUL-640: a channel skip carries its reason onto the row", () => {
  const reason = "reserved domain (QA or demo address, mail is never sent)";
  const patch = dispatchLogPatchFromHandlerResult(null, reason);
  assert.equal(patch.status, "skipped");
  assert.equal(patch.error_message, `skipped: ${reason}`);
});

test("TUL-640: a skip without a reason keeps the generic message", () => {
  assert.equal(dispatchLogPatchFromHandlerResult(null, undefined).error_message, SKIPPED_DISPATCH_ERROR);
});

test("TUL-640: isChannelSkip only accepts the skip shape", () => {
  assert.equal(isChannelSkip({ skipped: true, reason: "x" }), true);
  assert.equal(isChannelSkip({ skipped: true }), false);
  assert.equal(isChannelSkip({ providerRef: "re_1", from: "a", replyTo: null }), false);
  assert.equal(isChannelSkip("re_abc"), false);
  assert.equal(isChannelSkip(null), false);
});
