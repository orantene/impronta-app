import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALREADY_SUBSCRIBED_ERROR,
  SUBSCRIPTION_CHECK_FAILED_ERROR,
  checkoutGuardError,
  classifyExistingSubscription,
  isAlreadySubscribedError,
} from "./duplicate-subscription";

test("active, trialing and past_due block a second checkout", () => {
  for (const s of ["active", "trialing", "past_due"]) {
    assert.equal(classifyExistingSubscription({ data: { status: s }, error: null }), "blocking", s);
  }
});

test("no row, cancelled, incomplete and expired leave checkout open", () => {
  assert.equal(classifyExistingSubscription({ data: null, error: null }), "clear");
  for (const s of ["cancelled", "canceled", "incomplete", "incomplete_expired", "unpaid", null]) {
    assert.equal(classifyExistingSubscription({ data: { status: s }, error: null }), "clear", String(s));
  }
});

test("a failed read fails closed (unknown), never as clear", () => {
  assert.equal(classifyExistingSubscription({ data: null, error: { message: "boom" } }), "unknown");
});

test("guard errors: blocking and unknown refuse, clear passes", () => {
  assert.equal(checkoutGuardError("blocking"), ALREADY_SUBSCRIBED_ERROR);
  assert.equal(checkoutGuardError("unknown"), SUBSCRIPTION_CHECK_FAILED_ERROR);
  assert.equal(checkoutGuardError("clear"), null);
});

test("actions recognise the already-subscribed refusal to send people to the portal", () => {
  assert.equal(isAlreadySubscribedError(ALREADY_SUBSCRIBED_ERROR), true);
  assert.equal(isAlreadySubscribedError(SUBSCRIPTION_CHECK_FAILED_ERROR), false);
  assert.equal(isAlreadySubscribedError(undefined), false);
});

import { hasLiveTalentStripeSubscription } from "./duplicate-subscription";

test("TUL-1835: a live talent subscription in Stripe blocks even when the row is stale", () => {
  const talent = { checkout_type: "talent_subscription", plan_key: "talent_portfolio" };
  for (const status of ["active", "trialing", "past_due"]) {
    assert.equal(hasLiveTalentStripeSubscription([{ status, metadata: talent }]), true, status);
  }
  assert.equal(hasLiveTalentStripeSubscription([{ status: "trialing", metadata: { plan_key: "talent_pro" } }]), true);
});

test("TUL-1835: cancelled, incomplete and non-talent subscriptions do not block", () => {
  const talent = { checkout_type: "talent_subscription" };
  assert.equal(hasLiveTalentStripeSubscription([]), false);
  for (const status of ["canceled", "incomplete", "incomplete_expired", "unpaid"]) {
    assert.equal(hasLiveTalentStripeSubscription([{ status, metadata: talent }]), false, status);
  }
  assert.equal(
    hasLiveTalentStripeSubscription([{ status: "active", metadata: { checkout_type: "workspace_subscription", plan_key: "agency_pro" } }]),
    false,
  );
});
