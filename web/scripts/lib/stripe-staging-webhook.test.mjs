import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONNECT_EVENTS,
  CONNECT_ONLY_EVENTS,
  ENABLED_EVENTS,
  endpointKind,
  STRIPE_API_VERSION,
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
  // A disabled endpoint on the same URL is ignored: not reused, not counted as a duplicate.
  const disabled = { id: "we_5", url, status: "disabled", metadata: { managed_by: MANAGED_BY } };
  assert.equal(planEndpoint({ endpoints: [disabled], url, otherUrl, varExists: false }).action, "create");
  assert.equal(planEndpoint({ endpoints: [disabled, ours], url, otherUrl, varExists: true }).action, "reuse");
});

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("every account-level event the router handles is on the endpoint, and nothing else", () => {
  const routing = readFileSync(join(WEB, "src/lib/stripe/webhook-routing.ts"), "utf8");
  const routed = new Set([...routing.matchAll(/case "([a-z_]+(?:\.[a-z_]+)+)":/g)].map((m) => m[1]));
  assert.ok(routed.size > 20, `parsed only ${routed.size} cases`);
  const accountLevel = [...routed].filter((e) => !CONNECT_ONLY_EVENTS.includes(e));
  for (const e of accountLevel) assert.ok(ENABLED_EVENTS.includes(e), `routed but not enabled: ${e}`);
  for (const e of ENABLED_EVENTS) assert.ok(routed.has(e), `enabled but not routed: ${e}`);
  for (const e of CONNECT_ONLY_EVENTS) assert.ok(!ENABLED_EVENTS.includes(e), e);
  assert.ok(ENABLED_EVENTS.includes("subscription_schedule.released"));
  assert.ok(ENABLED_EVENTS.includes("refund.failed"));
});

test("endpoint api_version equals the app client's pinned apiVersion", () => {
  const client = readFileSync(join(WEB, "src/lib/stripe/client.ts"), "utf8");
  const pins = [...client.matchAll(/apiVersion:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(pins.length >= 1);
  for (const v of pins) assert.equal(v, STRIPE_API_VERSION);
});

test("connect lanes: same route as their account lane, CONNECT secret var, connect kind", () => {
  const usc = laneConfig("us-connect");
  assert.equal(usc.ok, true);
  assert.equal(usc.url, "https://pay.staging.tulala.digital/api/webhooks/stripe");
  assert.equal(usc.secretVar, "STRIPE_WEBHOOK_SECRET_CONNECT_TEST");
  assert.equal(usc.kind, "connect");
  assert.equal(usc.account, "us");
  assert.deepEqual(usc.events, CONNECT_EVENTS);
  assert.equal(usc.otherUrl, "https://pay.staging.tulala.digital/api/webhooks/stripe-mx");
  const mxc = laneConfig("mx-connect");
  assert.equal(mxc.url, "https://pay.staging.tulala.digital/api/webhooks/stripe-mx");
  assert.equal(mxc.secretVar, "STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST");
  assert.equal(mxc.account, "mx");
  assert.equal(mxc.otherUrl, "https://pay.staging.tulala.digital/api/webhooks/stripe");
  const us = laneConfig("us");
  assert.equal(us.kind, "account");
  assert.deepEqual(us.events, ENABLED_EVENTS);
  assert.equal(laneConfig("mx").account, "mx");
});

test("endpoint kind: Connect when Stripe marks an application or our lane metadata says so", () => {
  assert.equal(endpointKind({ id: "we", url: "u" }), "account");
  assert.equal(endpointKind({ id: "we", url: "u", application: null }), "account");
  assert.equal(endpointKind({ id: "we", url: "u", application: "ca_123" }), "connect");
  assert.equal(endpointKind({ id: "we", url: "u", metadata: { lane: "us-connect" } }), "connect");
  assert.equal(endpointKind({ id: "we", url: "u", metadata: { lane: "us" } }), "account");
});

test("endpoint plan is per kind: an account endpoint and a Connect endpoint share one URL", () => {
  const url = "https://pay.staging.tulala.digital/api/webhooks/stripe";
  const otherUrl = "https://pay.staging.tulala.digital/api/webhooks/stripe-mx";
  const acct = { id: "we_a", url, metadata: { managed_by: MANAGED_BY, lane: "us" } };
  const conn = { id: "we_c", url, application: "ca_1", metadata: { managed_by: MANAGED_BY, lane: "us-connect" } };
  // The account lane ignores the Connect endpoint and vice versa.
  assert.equal(planEndpoint({ endpoints: [acct, conn], url, otherUrl, varExists: true }).endpointId, "we_a");
  assert.equal(planEndpoint({ endpoints: [acct], url, otherUrl, varExists: false, kind: "connect" }).action, "create");
  assert.equal(planEndpoint({ endpoints: [acct, conn], url, otherUrl, varExists: true, kind: "connect" }).endpointId, "we_c");
  assert.equal(
    planEndpoint({ endpoints: [conn], url, otherUrl, varExists: false, kind: "connect", recreate: true }).action,
    "recreate",
  );
  // A Connect endpoint on the other lane's URL refuses the Connect lane, not the account lane.
  const connOther = { id: "we_o", url: otherUrl, application: "ca_1" };
  assert.equal(planEndpoint({ endpoints: [connOther], url, otherUrl, varExists: false, kind: "connect" }).action, "refuse");
  assert.equal(planEndpoint({ endpoints: [connOther], url, otherUrl, varExists: false }).action, "create");
});

test("unmarked endpoint + missing var: refuse without replaceUnmarked; with it, create marked then disable the old", () => {
  const url = "https://pay.staging.tulala.digital/api/webhooks/stripe-mx";
  const otherUrl = "https://pay.staging.tulala.digital/api/webhooks/stripe";
  const unmarked = { id: "we_old", url, metadata: {} };
  // Without the flag: today's refusal, unchanged.
  const refused = planEndpoint({ endpoints: [unmarked], url, otherUrl, varExists: false });
  assert.equal(refused.action, "refuse");
  // recreate alone still never touches an unmarked endpoint.
  assert.equal(planEndpoint({ endpoints: [unmarked], url, otherUrl, varExists: false, recreate: true }).action, "refuse");
  // With the flag: create a marked endpoint first, then disable (never delete) the old one.
  assert.deepEqual(planEndpoint({ endpoints: [unmarked], url, otherUrl, varExists: false, replaceUnmarked: true }), {
    action: "replace-unmarked",
    disableIds: ["we_old"],
  });
  // Several unmarked endpoints on the URL: all are disabled after the new one exists.
  const two = [unmarked, { ...unmarked, id: "we_old2" }];
  assert.deepEqual(planEndpoint({ endpoints: two, url, otherUrl, varExists: false, replaceUnmarked: true }).disableIds, ["we_old", "we_old2"]);
  // Without the flag, several is still the duplicate refusal.
  assert.equal(planEndpoint({ endpoints: two, url, otherUrl, varExists: false }).action, "refuse");
  // A marked endpoint is ours: the flag does not apply (recreate path / reuse as before).
  const ours = { id: "we_ours", url, metadata: { managed_by: MANAGED_BY } };
  assert.equal(planEndpoint({ endpoints: [ours], url, otherUrl, varExists: false, replaceUnmarked: true }).action, "refuse");
  assert.equal(planEndpoint({ endpoints: [ours], url, otherUrl, varExists: true, replaceUnmarked: true }).action, "reuse");
  // Var present + unmarked endpoint: plain reuse, nothing replaced.
  assert.equal(planEndpoint({ endpoints: [unmarked], url, otherUrl, varExists: true, replaceUnmarked: true }).action, "reuse");
  // Already-disabled endpoints are not counted or disabled again.
  const disabled = { id: "we_dis", url, status: "disabled", metadata: {} };
  assert.deepEqual(planEndpoint({ endpoints: [unmarked, disabled], url, otherUrl, varExists: false, replaceUnmarked: true }).disableIds, ["we_old"]);
  // Mixed marked + unmarked on one URL with the var missing: ambiguous, refuse.
  assert.equal(planEndpoint({ endpoints: [unmarked, ours], url, otherUrl, varExists: false, replaceUnmarked: true }).action, "refuse");
});

test("Connect endpoint events = every routed event a connected account delivers, nothing else", () => {
  const routing = readFileSync(join(WEB, "src/lib/stripe/webhook-routing.ts"), "utf8");
  // Group fall-through labels with the block that follows them.
  const labels = [...routing.matchAll(/case "([a-z_]+(?:\.[a-z_]+)+)":/g)];
  const blockOf = new Map();
  let pending = [];
  labels.forEach((m, i) => {
    pending.push(m[1]);
    const start = m.index + m[0].length;
    const end = i + 1 < labels.length ? labels[i + 1].index : routing.length;
    const seg = routing.slice(start, end);
    if (seg.trim().length === 0) return;
    for (const l of pending) blockOf.set(l, seg);
    pending = [];
  });
  const readsConnectedAccount = [...blockOf].filter(([, seg]) => seg.includes("event.account")).map(([l]) => l);
  assert.ok(readsConnectedAccount.includes("capability.updated"));
  assert.ok(readsConnectedAccount.includes("payout.paid"));
  const expected = new Set([...CONNECT_ONLY_EVENTS, ...readsConnectedAccount]);
  assert.deepEqual([...CONNECT_EVENTS].sort(), [...expected].sort());
  assert.equal(new Set(CONNECT_EVENTS).size, CONNECT_EVENTS.length);
  for (const e of CONNECT_EVENTS) assert.ok(blockOf.has(e), `connect event not routed: ${e}`);
});
