import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/** TUL-830: checkout refuses a second subscription and sends the person to the portal. */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const talentBilling = read("src/lib/stripe/talent-billing.ts");
const talentActions = read("src/app/(workspace)/[tenantSlug]/talent/settings/stripe-talent-actions.ts");
const workspaceActions = read("src/app/(workspace)/[tenantSlug]/admin/account/stripe-billing-actions.ts");

test("talent checkout runs the duplicate guard before any Stripe price or customer call", () => {
  const guard = talentBilling.indexOf('duplicateSubscriptionGuard("talent", opts.talentProfileId, opts.userId)');
  assert.ok(guard > 0, "guard is called with the session-scoped profile id");
  assert.ok(guard < talentBilling.indexOf("resolveCheckoutPrice("), "guard runs before price resolution");
  assert.ok(guard < talentBilling.indexOf("await getOrCreateTalentStripeCustomer("), "guard runs before customer creation");
});

test("talent upgrade action turns the refusal into a Billing Portal redirect", () => {
  assert.match(talentActions, /isAlreadySubscribedError\(result\.error\)/);
  assert.match(talentActions, /createTalentBillingPortalSession\(\{\s*userId: session\.user\.id/);
});

test("workspace upgrade keeps its live-subscription portal redirect", () => {
  assert.match(workspaceActions, /if \(await hasLiveWorkspaceSubscription\(scope\.tenantId\)\)/);
});

test("TUL-831: existing subscribers are routed to the in-app plan change (portal URL kept as fallback)", () => {
  assert.match(talentActions, /redirectUrl: portal\.data\.url, planChange \}/);
  assert.match(workspaceActions, /planChange: planChangeTarget\(planKey, interval\)/);
});

test("TUL-831: plan-change actions never write plan rows; the webhook re-fetches on resync", () => {
  for (const p of [
    "src/lib/billing/plan-change.ts",
    "src/lib/billing/plan-change.server.ts",
    "src/app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions.ts",
    "src/app/(workspace)/[tenantSlug]/admin/account/plan-change-actions.ts",
  ]) {
    assert.doesNotMatch(read(p), /\.from\([^)]*\)\s*\.(update|upsert|insert|delete)\(/, `${p} writes a DB row`);
    assert.doesNotMatch(read(p), /\.from\("(talent_profiles|agencies)"\)/, `${p} touches plan columns`);
  }
  const handler = read("src/lib/stripe/webhook-handler.ts");
  const at = handler.indexOf('case "subscription_plan_resync"');
  assert.ok(at > 0);
  assert.ok(handler.indexOf("stripe.subscriptions.retrieve(action.subscriptionId", at) > at);
});
