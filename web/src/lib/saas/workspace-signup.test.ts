import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceOnboardingPath,
  buildWorkspaceRegisterPath,
  isNetworkWorkspaceTierInterest,
  isPaidWorkspaceTierInterest,
  isSelfServeWorkspaceLeadEligible,
  resolveWorkspaceOwnerAppRole,
  isWorkspaceOnboardingPath,
  normalizeWorkspaceSlugCandidate,
  preferredWorkspaceSlugFromLead,
  workspaceBelongsToSignupLead,
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

test("workspace signup self-serve eligibility includes all paid tiers", () => {
  assert.equal(isSelfServeWorkspaceLeadEligible(undefined), true);
  assert.equal(isSelfServeWorkspaceLeadEligible(null), true);
  assert.equal(isSelfServeWorkspaceLeadEligible("free"), true);
  assert.equal(isSelfServeWorkspaceLeadEligible("studio"), true);
  assert.equal(isSelfServeWorkspaceLeadEligible("agency"), true);
  assert.equal(isSelfServeWorkspaceLeadEligible("network"), true);
  assert.equal(isSelfServeWorkspaceLeadEligible("legacy"), false);
});

test("workspace signup paid tier helpers", () => {
  assert.equal(isPaidWorkspaceTierInterest("studio"), true);
  assert.equal(isPaidWorkspaceTierInterest("agency"), true);
  assert.equal(isPaidWorkspaceTierInterest("free"), false);
  assert.equal(isNetworkWorkspaceTierInterest("network"), true);
  assert.equal(isNetworkWorkspaceTierInterest("agency"), false);
});

test("workspace signup path helpers produce stable auth routes", () => {
  const onboarding = buildWorkspaceOnboardingPath("lead-123");
  const register = buildWorkspaceRegisterPath("lead-123");

  assert.equal(onboarding, "/onboarding/workspace?lead=lead-123");
  assert.equal(
    register,
    "/register?intent=workspace&lead=lead-123&next=%2Fonboarding%2Fworkspace%3Flead%3Dlead-123",
  );
  assert.equal(isWorkspaceOnboardingPath(onboarding), true);
  assert.equal(isWorkspaceOnboardingPath("/onboarding/role"), false);
});

// ── Who may own a workspace ───────────────────────────────────────────────
// Being a client or a talent no longer disqualifies an account. The old gate
// refused any client/talent who had finished onboarding, permanently, and the
// only self-serve route into that state was picking "I'm a Client" on
// /onboarding/role, a two-option page. What it must NOT do is overwrite the
// role: workspace access comes from the owner membership, and rewriting
// app_role would move a talent's home dashboard out from under them.

test("a role-less account becomes agency_staff when it opens a workspace", () => {
  assert.equal(resolveWorkspaceOwnerAppRole(null), "agency_staff");
  assert.equal(resolveWorkspaceOwnerAppRole(undefined), "agency_staff");
  assert.equal(resolveWorkspaceOwnerAppRole(""), "agency_staff");
});

test("an existing role is never overwritten by workspace provisioning", () => {
  for (const role of ["client", "talent", "agency_staff", "super_admin"]) {
    assert.equal(
      resolveWorkspaceOwnerAppRole(role),
      null,
      `${role} must keep its app_role when it opens a workspace`,
    );
  }
});

// ── One Free workspace per owner ──────────────────────────────────────────
// A signed-in owner who reserved a NEW slug on /get-started used to be
// silently redirected into whatever Free workspace they already had: the
// reserved slug was never created and the promised URL 404'd. Reuse is now
// scoped to the lead that created the workspace.

test("workspaceBelongsToSignupLead matches on the stamped lead id", () => {
  assert.equal(
    workspaceBelongsToSignupLead({
      workspaceSignupLeadId: "lead-1",
      workspaceSlug: "qa-free-studio",
      leadId: "lead-1",
      desiredSlug: "vera-atelier",
    }),
    true,
  );
});

test("workspaceBelongsToSignupLead rejects an unrelated owned workspace", () => {
  assert.equal(
    workspaceBelongsToSignupLead({
      workspaceSignupLeadId: "lead-older",
      workspaceSlug: "qa-free-studio",
      leadId: "lead-new",
      desiredSlug: "vera-atelier",
    }),
    false,
  );
});

test("workspaceBelongsToSignupLead falls back to an exact slug match for legacy rows", () => {
  assert.equal(
    workspaceBelongsToSignupLead({
      workspaceSignupLeadId: null,
      workspaceSlug: "vera-atelier",
      leadId: "lead-new",
      desiredSlug: "vera-atelier",
    }),
    true,
  );
  assert.equal(
    workspaceBelongsToSignupLead({
      workspaceSignupLeadId: null,
      workspaceSlug: "qa-free-studio",
      leadId: "lead-new",
      desiredSlug: "vera-atelier",
    }),
    false,
  );
  // An empty desired slug must never match everything.
  assert.equal(
    workspaceBelongsToSignupLead({
      workspaceSignupLeadId: null,
      workspaceSlug: "",
      leadId: "lead-new",
      desiredSlug: "",
    }),
    false,
  );
});

// The middleware branch that redirects an already-signed-in visitor away from
// /register reads ONLY `?next=`. Without it the lead is dropped and the user
// lands on /onboarding/role, where picking "I'm a Client" permanently
// disqualifies the account from workspace provisioning.
test("buildWorkspaceRegisterPath carries a next back to the workspace trampoline", () => {
  const path = buildWorkspaceRegisterPath("lead-42");
  const query = new URLSearchParams(path.split("?")[1] ?? "");
  assert.equal(query.get("lead"), "lead-42");
  assert.equal(query.get("intent"), "workspace");
  assert.equal(query.get("next"), buildWorkspaceOnboardingPath("lead-42"));
  assert.equal(isWorkspaceOnboardingPath(query.get("next") ?? ""), true);
});
