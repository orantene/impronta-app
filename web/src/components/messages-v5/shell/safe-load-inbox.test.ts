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

test("direct load: a call discarded by a navigation never settles; the retry renders the rows", async () => {
  let calls = 0;
  const result = await safeLoadInbox(() => {
    calls += 1;
    // First call: Next discarded it (navigation during the action); never settles.
    if (calls === 1) return new Promise(() => undefined);
    return Promise.resolve({ ok: true as const, rows: [], unreadCount: 2 });
  }, input, 0, 20);
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: true, rows: [], unreadCount: 2 });
});

test("two stalled calls end in the unavailable refusal, not an endless skeleton", async () => {
  const result = await safeLoadInbox(() => new Promise(() => undefined), input, 0, 20);
  assert.deepEqual(result, { ok: false, reason: "unavailable" });
});
