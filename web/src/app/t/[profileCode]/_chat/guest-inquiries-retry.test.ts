import assert from "node:assert/strict";
import test from "node:test";

import { LIST_RETRY_DELAYS_MS, nextListRetryDelayMs } from "./guest-inquiries-retry";

test("e2e E1: a resumed inquiry missing from the list keeps being retried with growing delays", () => {
  const seen: Array<number | null> = [];
  for (let attempt = 0; attempt <= LIST_RETRY_DELAYS_MS.length; attempt++) seen.push(nextListRetryDelayMs(attempt, "i1", []));
  assert.deepEqual(seen, [400, 800, 1600, 3200, 5000, null], "more than one retry, then a hard stop");
});

test("it also retries when the list is non-empty but lacks the resumed inquiry", () => {
  assert.equal(nextListRetryDelayMs(0, "i1", ["other"]), 400);
});

test("no retry once the inquiry is listed, and none without an active inquiry", () => {
  assert.equal(nextListRetryDelayMs(0, "i1", ["i1", "i2"]), null);
  assert.equal(nextListRetryDelayMs(0, null, []), null);
});
