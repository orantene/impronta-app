import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createSendLock } from "./send-lock";

test("TUL-920: two submits in the same tick post once", async () => {
  const lock = createSendLock();
  let posts = 0;
  const send = () => lock.run(async () => { posts += 1; await new Promise((r) => setTimeout(r, 5)); return "ok"; });
  const [a, b] = await Promise.all([send(), send()]);
  assert.equal(posts, 1);
  assert.deepEqual([a, b], ["ok", undefined]);
  await send();
  assert.equal(posts, 2, "the lock releases after the first send settles");
});

test("TUL-920: the lock releases when the send throws", async () => {
  const lock = createSendLock();
  await assert.rejects(lock.run(async () => { throw new Error("x"); }));
  assert.equal(lock.busy, false);
  assert.equal(await lock.run(async () => 1), 1);
});

test("TUL-920: every guest send path goes through the lock", () => {
  const src = readFileSync(join(__dirname, "use-mini-chat-send.ts"), "utf8");
  for (const name of ["handleFirstSendUnlocked", "handleReplyUnlocked", "sendToAgencyUnlocked"]) {
    assert.match(src, new RegExp(`lock\\.run\\(${name}\\)`));
  }
});
