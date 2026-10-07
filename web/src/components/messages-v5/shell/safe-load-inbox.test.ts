import assert from "node:assert/strict";
import { test } from "node:test";

import { safeLoadInbox } from "./safe-load-inbox";

const input = { locationSlug: "all", filter: "all" as const };

test("passes a result through untouched", async () => {
  const ok = { ok: true as const, rows: [], unreadCount: 0 };
  assert.deepEqual(await safeLoadInbox(async () => ok, input, 0), ok);
});

test("a rejected action is retried once and can recover", async () => {
  let calls = 0;
  const result = await safeLoadInbox(async () => {
    calls += 1;
    if (calls === 1) throw new Error("503");
    return { ok: true as const, rows: [], unreadCount: 2 };
  }, input, 0);
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});

test("two rejections resolve to the unavailable refusal instead of throwing", async () => {
  let calls = 0;
  const result = await safeLoadInbox(async () => {
    calls += 1;
    throw new Error("An unexpected response was received from the server.");
  }, input, 0);
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: false, reason: "unavailable" });
});
