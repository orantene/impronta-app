import test from "node:test";
import assert from "node:assert/strict";
import { parseOnboardingFlagRows } from "./onboarding-flags";

test("absent row → module off", () => {
  assert.equal(parseOnboardingFlagRows([]).onboarding_module_enabled, false);
  assert.equal(parseOnboardingFlagRows(null).onboarding_module_enabled, false);
});

test("boolean true and {enabled:true} → on; strings never count", () => {
  assert.equal(parseOnboardingFlagRows([{ key: "onboarding_module_enabled", value: true }]).onboarding_module_enabled, true);
  assert.equal(parseOnboardingFlagRows([{ key: "onboarding_module_enabled", value: { enabled: true } }]).onboarding_module_enabled, true);
  assert.equal(parseOnboardingFlagRows([{ key: "onboarding_module_enabled", value: "true" }]).onboarding_module_enabled, false);
  assert.equal(parseOnboardingFlagRows([{ key: "onboarding_module_enabled", value: false }]).onboarding_module_enabled, false);
});
