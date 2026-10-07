import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeGetStartedRedirect, cronSecretPlan } from "./smoke-decisions.mjs";

test("get-started: 307 to absolute /start passes", () => {
  assert.equal(judgeGetStartedRedirect(307, "https://tulala.digital/start").ok, true);
});
test("get-started: 307 to relative /start (with query) passes", () => {
  assert.equal(judgeGetStartedRedirect(307, "/start").ok, true);
  assert.equal(judgeGetStartedRedirect(307, "/start?src=x").ok, true);
});
test("get-started: 200 now fails (not weakened)", () => {
  assert.equal(judgeGetStartedRedirect(200, "").ok, false);
});
test("get-started: other redirect statuses fail", () => {
  for (const s of [301, 302, 308, 404, 500]) {
    assert.equal(judgeGetStartedRedirect(s, "/start").ok, false, String(s));
  }
});
test("get-started: 307 to the old /?start= target fails", () => {
  assert.equal(judgeGetStartedRedirect(307, "/?start=1").ok, false);
});
test("get-started: 307 with missing or wrong Location fails", () => {
  assert.equal(judgeGetStartedRedirect(307, undefined).ok, false);
  assert.equal(judgeGetStartedRedirect(307, "").ok, false);
  assert.equal(judgeGetStartedRedirect(307, "/get-started").ok, false);
  assert.equal(judgeGetStartedRedirect(307, "/restart").ok, false);
});

test("cron secret: absent values skip with the exact one-line message", () => {
  for (const v of [undefined, null, "", "   "]) {
    assert.deepEqual(cronSecretPlan(v), { action: "skip", message: "skipped: CRON_SECRET not set" });
  }
});
test("cron secret: present value runs and never leaks into the plan", () => {
  const plan = cronSecretPlan("s3cr3t-value");
  assert.deepEqual(plan, { action: "run" });
  assert.equal(JSON.stringify(plan).includes("s3cr3t"), false);
});
