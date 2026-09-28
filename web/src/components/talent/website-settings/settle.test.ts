import assert from "node:assert/strict";
import { test } from "node:test";

import { settle } from "./settle";

test("resolves with the value", async () => {
  assert.deepEqual(await settle(async () => 7, 50), { ok: true, value: 7 });
});

test("a rejection becomes a failed result", async () => {
  assert.deepEqual(await settle(() => Promise.reject(new Error("net")), 50), { ok: false, reason: "error" });
});

test("a synchronous throw becomes a failed result", async () => {
  assert.deepEqual(
    await settle(() => {
      throw new Error("boom");
    }, 50),
    { ok: false, reason: "error" },
  );
});

test("a call that never settles times out", async () => {
  assert.deepEqual(await settle(() => new Promise<never>(() => {}), 20), { ok: false, reason: "timeout" });
});

test("a late success after the timeout does not change the result", async () => {
  const r = await settle(() => new Promise<number>((res) => setTimeout(() => res(1), 60)), 20);
  assert.deepEqual(r, { ok: false, reason: "timeout" });
});
