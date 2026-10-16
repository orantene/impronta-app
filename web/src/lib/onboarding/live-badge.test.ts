import assert from "node:assert/strict";
import { test } from "node:test";

import { createLiveVerifyMemo, liveBadgeState } from "./live-badge";

test("live only when the site is published AND the address check passed", () => {
  assert.equal(liveBadgeState({ published: true, verified: true }), "live");
});

test("published but not verified reads as checking, never live", () => {
  assert.equal(liveBadgeState({ published: true, verified: false }), "checking");
  assert.equal(liveBadgeState({ published: true, verified: null }), "checking");
});

test("unpublished is never live, whatever a stale check says", () => {
  assert.equal(liveBadgeState({ published: false, verified: true }), "not_live");
  assert.equal(liveBadgeState({ published: false, verified: null }), "not_live");
});

test("memo reuses a passing check and re-checks a failure sooner", async () => {
  let now = 0;
  let calls = 0;
  const memo = createLiveVerifyMemo({ okTtlMs: 600_000, failTtlMs: 30_000, now: () => now });
  const check = async () => {
    calls += 1;
    return calls > 1;
  };
  assert.equal(await memo.get("https://a.tulala.digital", check), false);
  now = 10_000;
  assert.equal(await memo.get("https://a.tulala.digital", check), false);
  assert.equal(calls, 1);
  now = 40_000;
  assert.equal(await memo.get("https://a.tulala.digital", check), true);
  now = 500_000;
  assert.equal(await memo.get("https://a.tulala.digital", check), true);
  assert.equal(calls, 2);
});

test("memo.forget drops the cached answer (publish just happened)", async () => {
  let calls = 0;
  const memo = createLiveVerifyMemo({ okTtlMs: 1000, failTtlMs: 1000, now: () => 0 });
  const check = async () => {
    calls += 1;
    return true;
  };
  await memo.get("u", check);
  memo.forget("u");
  await memo.get("u", check);
  assert.equal(calls, 2);
});
