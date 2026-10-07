import assert from "node:assert/strict";
import { test } from "node:test";

import { recentHistoryWrites, recordHistoryWrite } from "./history-write-trace";
import { ServerActionStalledError, settleServerAction } from "./settle-server-action";

const opts = { label: "testAction", area: "test", budgetMs: 20, retryDelayMs: 0 };

test("returns the action value", async () => {
  assert.equal(await settleServerAction(async () => 7, opts), 7);
});

test("a discarded (never-settling) first call is retried", async () => {
  let calls = 0;
  const value = await settleServerAction(() => {
    calls += 1;
    return calls === 1 ? new Promise<number>(() => undefined) : Promise.resolve(3);
  }, opts);
  assert.equal(value, 3);
  assert.equal(calls, 2);
});

test("rejects with ServerActionStalledError instead of hanging", async () => {
  await assert.rejects(
    settleServerAction(() => new Promise<number>(() => undefined), opts),
    (error: unknown) => error instanceof ServerActionStalledError,
  );
});

test("history writes are kept (last 10) for the stall report", () => {
  for (let i = 0; i < 12; i += 1) recordHistoryWrite("replace", `/talent/inbox?i=${i}`, i);
  const writes = recentHistoryWrites();
  assert.equal(writes.length, 10);
  assert.equal(writes.at(-1)?.url, "/talent/inbox?i=11");
});
