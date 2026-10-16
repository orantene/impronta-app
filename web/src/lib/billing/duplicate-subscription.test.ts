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
