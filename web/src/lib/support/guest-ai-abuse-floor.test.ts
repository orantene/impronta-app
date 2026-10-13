import assert from "node:assert/strict";
import { test } from "node:test";

import { guestAiAbuseFloor } from "./guest-ai-abuse-floor";
import { guestSupportMayServe, marketingAskMayServe } from "./guest-support-serve";

test("unsigned cookie refuses before any adapter call", () => {
  const r = guestAiAbuseFloor({ signingEnabled: false, kvConfigured: true });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.invokeAdapter, false);
    assert.equal(r.status, 503);
  }
});

test("KV unset / no-op limiter refuses rather than calling the adapter", () => {
  const r = guestAiAbuseFloor({ signingEnabled: true, kvConfigured: false });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.invokeAdapter, false);
    assert.equal(r.status, 503);
  }
});

test("signed + KV configured is the only pass", () => {
  assert.equal(guestAiAbuseFloor({ signingEnabled: true, kvConfigured: true }).ok, true);
});

test("launcher and actions refuse when signing is off", () => {
  assert.equal(guestSupportMayServe(false), false);
  assert.equal(guestSupportMayServe(true), true);
});

test("marketing ask CTA serves only with FAB flag AND signing", () => {
  assert.equal(marketingAskMayServe(true, true), true);
  assert.equal(marketingAskMayServe(false, true), false);
  assert.equal(marketingAskMayServe(true, false), false);
});
