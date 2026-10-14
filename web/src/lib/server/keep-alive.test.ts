import assert from "node:assert/strict";
import test from "node:test";

import { keepAlive } from "./keep-alive";

test("keepAlive outside a request scope does not throw and swallows rejections", async () => {
  let ran = false;
  const work = Promise.resolve().then(() => {
    ran = true;
  });
  assert.doesNotThrow(() => keepAlive(work));
  assert.doesNotThrow(() => keepAlive(Promise.reject(new Error("boom"))));
  await work;
  assert.equal(ran, true);
});
