import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENABLED_EVENTS,
  MANAGED_BY,
  checkBalanceLivemode,
  checkTargetUrl,
  checkTestKey,
  laneConfig,
  pickVercelEntry,
  planEndpoint,
} from "./stripe-staging-webhook.mjs";

test("only test keys pass", () => {
  assert.equal(checkTestKey("sk_test_abc").ok, true);
  assert.equal(checkTestKey("rk_test_abc").ok, true);
  for (const k of ["sk_live_abc", "rk_live_abc", "", undefined, "pk_test_abc", "junk"]) {
    assert.equal(checkTestKey(k).ok, false, String(k));
  }
});

test("balance must say livemode false", () => {
  assert.equal(checkBalanceLivemode({ livemode: false }).ok, true);
  assert.equal(checkBalanceLivemode({ livemode: true }).ok, false);
  assert.equal(checkBalanceLivemode({}).ok, false);
  assert.equal(checkBalanceLivemode(null).ok, false);
});

test("only https staging hosts", () => {
  assert.equal(checkTargetUrl("https://pay.staging.tulala.digital/api/webhooks/stripe").ok, true);
  assert.equal(checkTargetUrl("https://staging-qa-app.tulala.digital/x").ok, true);
  assert.equal(checkTargetUrl("https://qa-3.tulala.digital/x").ok, true);
  for (const u of [
    "https://app.tulala.digital/api/webhooks/stripe",
    "https://tulala.digital/api/webhooks/stripe",
    "http://pay.staging.tulala.digital/api/webhooks/stripe",
    "https://pay.staging.evil.com/x",
    "nope",
  ]) {
    assert.equal(checkTargetUrl(u).ok, false, u);
  }
});

test("lane picks path and _TEST secret var", () => {
  const us = laneConfig("us");
  assert.equal(us.url, "https://pay.staging.tulala.digital/api/webhooks/stripe");
  assert.equal(us.secretVar, "STRIPE_WEBHOOK_SECRET_TEST");
  assert.equal(us.otherUrl, "https://pay.staging.tulala.digital/api/webhooks/stripe-mx");
  const mx = laneConfig("mx");
  assert.equal(mx.secretVar, "STRIPE_MX_WEBHOOK_SECRET_TEST");
  assert.equal(laneConfig("eu").ok, false);
  assert.equal(laneConfig("us", "https://app.tulala.digital").ok, false);
});

test("events are account-level only", () => {
  assert.ok(ENABLED_EVENTS.includes("invoice.payment_failed"));
  assert.ok(ENABLED_EVENTS.includes("customer.subscription.updated"));
  assert.ok(!ENABLED_EVENTS.includes("account.updated"));
  assert.ok(!ENABLED_EVENTS.includes("capability.updated"));
  assert.equal(new Set(ENABLED_EVENTS).size, ENABLED_EVENTS.length);
});

test("vercel entry: preview-wide only, never production", () => {
  const K = "STRIPE_WEBHOOK_SECRET_TEST";
  const prodOnly = { id: "p", key: K, target: ["production"] };
  assert.deepEqual(pickVercelEntry([prodOnly], K), { ok: true, entry: null });
  const prev = { id: "v", key: K, target: ["preview"] };
  assert.equal(pickVercelEntry([prodOnly, prev], K).entry.id, "v");
  assert.equal(pickVercelEntry([{ id: "b", key: K, target: ["preview"], gitBranch: "main" }], K).entry, null);
  assert.equal(pickVercelEntry([{ id: "x", key: K, target: ["preview", "production"] }], K).ok, false);
  assert.equal(pickVercelEntry([prev, { ...prev, id: "w" }], K).ok, false);
});

test("endpoint plan", () => {
  const url = "https://pay.staging.tulala.digital/api/webhooks/stripe";
  const otherUrl = "https://pay.staging.tulala.digital/api/webhooks/stripe-mx";
  const ours = { id: "we_1", url, metadata: { managed_by: MANAGED_BY } };
  assert.equal(planEndpoint({ endpoints: [], url, otherUrl, varExists: false }).action, "create");
  assert.equal(planEndpoint({ endpoints: [ours], url, otherUrl, varExists: true }).action, "reuse");
  assert.equal(planEndpoint({ endpoints: [ours], url, otherUrl, varExists: false }).action, "refuse");
  assert.equal(planEndpoint({ endpoints: [ours], url, otherUrl, varExists: false, recreate: true }).action, "recreate");
  assert.equal(
    planEndpoint({ endpoints: [{ id: "we_2", url, metadata: {} }], url, otherUrl, varExists: false, recreate: true }).action,
    "refuse",
  );
  assert.equal(planEndpoint({ endpoints: [{ id: "we_3", url: otherUrl }], url, otherUrl, varExists: false }).action, "refuse");
  assert.equal(
    planEndpoint({ endpoints: [{ id: "we_3", url: otherUrl, status: "disabled" }], url, otherUrl, varExists: false }).action,
    "create",
  );
  assert.equal(planEndpoint({ endpoints: [ours, { ...ours, id: "we_4" }], url, otherUrl, varExists: true }).action, "refuse");
});
