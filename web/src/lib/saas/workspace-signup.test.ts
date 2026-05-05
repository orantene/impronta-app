import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceOnboardingPath,
  buildWorkspaceRegisterPath,
  isSelfServeWorkspaceLeadEligible,
  isWorkspaceSignupProfileEligible,
  isWorkspaceOnboardingPath,
  normalizeWorkspaceSlugCandidate,
  preferredWorkspaceSlugFromLead,
} from "./workspace-signup";

test("workspace signup slug normalization removes punctuation and accents", () => {
  assert.equal(
    normalizeWorkspaceSlugCandidate("  Café del Mar / Tulum  "),
    "cafe-del-mar-tulum",
  );
});

test("workspace signup picks subdomain first, then name, then email", () => {
  assert.equal(
    preferredWorkspaceSlugFromLead({
      subdomainWanted: "my-roster",
      name: "Ignored Name",
      email: "hello@example.com",
    }),
    "my-roster",
  );

  assert.equal(
    preferredWorkspaceSlugFromLead({
      subdomainWanted: "",
      name: "Studio Norte",
      email: "hello@example.com",
    }),
    "studio-norte",
  );

  assert.equal(
    preferredWorkspaceSlugFromLead({
      subdomainWanted: "",
      name: "",
      email: "owner@example.com",
    }),
    "owner",
  );
});

test("workspace signup self-serve eligibility is free-or-unspecified only", () => {
  assert.equal(isSelfServeWorkspaceLeadEligible(undefined), true);
  assert.equal(isSelfServeWorkspaceLeadEligible(null), true);
  assert.equal(isSelfServeWorkspaceLeadEligible("free"), true);
  assert.equal(isSelfServeWorkspaceLeadEligible("studio"), false);
  assert.equal(isSelfServeWorkspaceLeadEligible("agency"), false);
  assert.equal(isSelfServeWorkspaceLeadEligible("network"), false);
});

test("workspace signup path helpers produce stable auth routes", () => {
  const onboarding = buildWorkspaceOnboardingPath("lead-123");
  const register = buildWorkspaceRegisterPath("lead-123");

  assert.equal(onboarding, "/onboarding/workspace?lead=lead-123");
  assert.equal(register, "/register?intent=workspace&lead=lead-123");
  assert.equal(isWorkspaceOnboardingPath(onboarding), true);
  assert.equal(isWorkspaceOnboardingPath("/onboarding/role"), false);
});

test("workspace signup allows placeholder onboarding profiles", () => {
  assert.equal(
    isWorkspaceSignupProfileEligible({
      appRole: "client",
      accountStatus: "onboarding",
      onboardingCompletedAt: null,
      hasClientProfile: false,
      hasTalentProfile: false,
    }),
    true,
  );

  assert.equal(
    isWorkspaceSignupProfileEligible({
      appRole: "talent",
      accountStatus: "registered",
      onboardingCompletedAt: null,
      hasClientProfile: false,
      hasTalentProfile: false,
    }),
    true,
  );
});

test("workspace signup blocks real client and talent accounts", () => {
  assert.equal(
    isWorkspaceSignupProfileEligible({
      appRole: "client",
      accountStatus: "onboarding",
      onboardingCompletedAt: null,
      hasClientProfile: true,
      hasTalentProfile: false,
    }),
    false,
  );

  assert.equal(
    isWorkspaceSignupProfileEligible({
      appRole: "talent",
      accountStatus: "onboarding",
      onboardingCompletedAt: null,
      hasClientProfile: false,
      hasTalentProfile: true,
    }),
    false,
  );

  assert.equal(
    isWorkspaceSignupProfileEligible({
      appRole: "client",
      accountStatus: "active",
      onboardingCompletedAt: null,
      hasClientProfile: false,
      hasTalentProfile: false,
    }),
    false,
  );
});
