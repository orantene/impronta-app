import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ONBOARDING_BOUNCE_WINDOW_S,
  onboardingHoldCopy,
  shouldHoldOnboardingBounce,
  shouldRereadBeforeOnboardingBounce,
} from "./onboarding-bounce";

const now = 1_790_000_000_000;

test("middleware re-reads before bouncing on a role-less profile only", () => {
  assert.equal(shouldRereadBeforeOnboardingBounce(null), true);
  assert.equal(shouldRereadBeforeOnboardingBounce({ app_role: null } as never), true);
  assert.equal(shouldRereadBeforeOnboardingBounce({ app_role: "talent" } as never), false);
});

test("/onboarding/role holds instead of bouncing back inside the window", () => {
  const recent = String(now - 2_000);
  assert.equal(shouldHoldOnboardingBounce({ bounceCookie: recent, destination: "/talent", now }), true);
  assert.equal(
    shouldHoldOnboardingBounce({ bounceCookie: recent, destination: "/talent/today", now }),
    true,
  );
});

test("no hold without a recent bounce, or when the chooser is the destination", () => {
  assert.equal(shouldHoldOnboardingBounce({ bounceCookie: undefined, destination: "/talent", now }), false);
  assert.equal(shouldHoldOnboardingBounce({ bounceCookie: "junk", destination: "/talent", now }), false);
  const old = String(now - ONBOARDING_BOUNCE_WINDOW_S * 1000 - 1);
  assert.equal(shouldHoldOnboardingBounce({ bounceCookie: old, destination: "/talent", now }), false);
  assert.equal(
    shouldHoldOnboardingBounce({ bounceCookie: String(now), destination: "/onboarding/role", now }),
    false,
  );
});

test("holding copy exists in English and Spanish", () => {
  assert.equal(onboardingHoldCopy("en").title, "Setting up your page");
  assert.equal(onboardingHoldCopy("es").title, "Estamos preparando tu página");
  assert.equal(onboardingHoldCopy(null).cta, "Try again now");
});
