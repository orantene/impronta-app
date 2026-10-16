import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { decideCheckoutSessionSync, isCheckoutSessionId } from "./checkout-session-sync";

const owner = { ownerProfileId: "tp_1", ownerUserId: "u_1" };
const good = {
  status: "complete",
  mode: "subscription",
  subscription: "sub_123",
  metadata: { checkout_type: "talent_subscription", talent_profile_id: "tp_1", user_id: "u_1", plan_key: "talent_portfolio" },
};

test("only real Checkout session ids are accepted from the URL", () => {
  assert.equal(isCheckoutSessionId("cs_test_a1B2c3"), true);
  assert.equal(isCheckoutSessionId("cs_live_a1B2c3"), true);
  assert.equal(isCheckoutSessionId("{CHECKOUT_SESSION_ID}"), false);
  assert.equal(isCheckoutSessionId("sub_123"), false);
  assert.equal(isCheckoutSessionId(["cs_test_a"]), false);
  assert.equal(isCheckoutSessionId(undefined), false);
});

test("a completed checkout owned by the signed-in talent syncs its subscription", () => {
  assert.deepEqual(decideCheckoutSessionSync({ session: good, ...owner }), {
    ok: true,
    subscriptionId: "sub_123",
    planKey: "talent_portfolio",
  });
  const expanded = { ...good, subscription: { id: "sub_9" } };
  assert.equal((decideCheckoutSessionSync({ session: expanded, ...owner }) as { subscriptionId: string }).subscriptionId, "sub_9");
});

test("someone else's session never syncs (owner check on profile AND user)", () => {
  assert.deepEqual(decideCheckoutSessionSync({ session: good, ownerProfileId: "tp_2", ownerUserId: "u_1" }), { ok: false, reason: "not_owner" });
  assert.deepEqual(decideCheckoutSessionSync({ session: good, ownerProfileId: "tp_1", ownerUserId: "u_2" }), { ok: false, reason: "not_owner" });
});

test("incomplete, non-subscription or non-talent sessions do not sync", () => {
  assert.equal(decideCheckoutSessionSync({ session: { ...good, status: "open" }, ...owner }).ok, false);
  assert.equal(decideCheckoutSessionSync({ session: { ...good, mode: "payment" }, ...owner }).ok, false);
  assert.equal(decideCheckoutSessionSync({ session: { ...good, subscription: null }, ...owner }).ok, false);
  assert.equal(
    decideCheckoutSessionSync({ session: { ...good, metadata: { ...good.metadata, checkout_type: "workspace_subscription" } }, ...owner }).ok,
    false,
  );
});

test("plan key falls back to talent_pro only when metadata lacks a known plan", () => {
  const r = decideCheckoutSessionSync({ session: { ...good, metadata: { ...good.metadata, plan_key: "weird" } }, ...owner });
  assert.equal((r as { planKey: string }).planKey, "talent_pro");
});

test("success page runs the owner-checked sync and Checkout sends the session id back", () => {
  const page = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/settings/page.tsx"), "utf8");
  assert.match(page, /syncTalentCheckoutSession\(\{ sessionId: sp\.session_id, ownerProfileId: profile\.id, ownerUserId: session\.user\.id \}\)/);
  const billing = readFileSync(join(process.cwd(), "src/lib/stripe/talent-billing.ts"), "utf8");
  assert.match(billing, /billing=success&session_id=\{CHECKOUT_SESSION_ID\}/);
  const server = readFileSync(join(process.cwd(), "src/lib/billing/checkout-session-sync.server.ts"), "utf8");
  assert.match(server, /syncTalentSubscriptionToDb\(subscription, decision\.planKey/);
});
