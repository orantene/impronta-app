import assert from "node:assert/strict";
import { test } from "node:test";

import {
  builderPlanAllows,
  clampFeaturedRosterLimitForPlan,
  cmsAdditionalPageDeniedReason,
  getBuilderPlanPolicy,
  normalizeBuilderWorkspacePlan,
  resolveStarterTemplateSlugs,
  workspaceTemplateLibraryDeniedReason,
} from "./builder-capabilities";
import {
  brandedSubdomainEligible,
  customDomainEligible,
} from "@/lib/saas/workspace-public-url";

test("normalizeBuilderWorkspacePlan defaults unknown values to free", () => {
  assert.equal(normalizeBuilderWorkspacePlan(null), "free");
  assert.equal(normalizeBuilderWorkspacePlan("unknown"), "free");
  assert.equal(normalizeBuilderWorkspacePlan("studio"), "studio");
});

test("free plan policy enforces one page and five roster profile cap", () => {
  const policy = getBuilderPlanPolicy("free");
  assert.equal(policy.maxPublicPages, 1);
  assert.equal(policy.maxVisibleRosterProfiles, 5);
  assert.equal(policy.shellEditMode, "locked");
  assert.equal(policy.brandedSubdomainEligible, false);
  assert.equal(policy.customDomainEligible, false);
});

test("studio plan policy enables template library and basic shell editing", () => {
  const policy = getBuilderPlanPolicy("studio");
  assert.equal(policy.workspaceTemplateLibrary, true);
  assert.equal(policy.shellEditMode, "basic");
  assert.equal(policy.brandedSubdomainEligible, true);
  assert.equal(policy.customDomainEligible, false);
});

test("agency and network plan policies allow full shell editing", () => {
  assert.equal(getBuilderPlanPolicy("agency").shellEditMode, "full");
  assert.equal(getBuilderPlanPolicy("network").shellEditMode, "full");
  assert.equal(getBuilderPlanPolicy("agency").customDomainEligible, true);
  assert.equal(getBuilderPlanPolicy("network").customDomainEligible, true);
});

test("builder capability gates keep free shell locked but body editable", () => {
  assert.equal(builderPlanAllows("free", "builder.shell.edit"), false);
  assert.equal(builderPlanAllows("free", "builder.section.body.edit"), true);
  assert.equal(builderPlanAllows("studio", "builder.shell.edit"), true);
  assert.equal(builderPlanAllows("studio", "builder.domain.subdomain"), true);
  assert.equal(builderPlanAllows("studio", "builder.domain.custom"), false);
  assert.equal(builderPlanAllows("agency", "builder.domain.custom"), true);
});

test("resolveStarterTemplateSlugs keeps free plan on free starter only", () => {
  const all = ["free-quickstart-5", "home-core-4", "classic", "studio-minimal"];
  assert.deepEqual(resolveStarterTemplateSlugs("free", all), [
    "free-quickstart-5",
  ]);
  assert.deepEqual(resolveStarterTemplateSlugs("studio", all), [
    "home-core-4",
    "classic",
    "studio-minimal",
  ]);
});

test("cmsAdditionalPageDeniedReason blocks free, allows paid plans", () => {
  assert.match(cmsAdditionalPageDeniedReason("free") ?? "", /one landing page/i);
  assert.equal(cmsAdditionalPageDeniedReason("studio"), null);
});

test("workspaceTemplateLibraryDeniedReason blocks free, allows paid plans", () => {
  assert.match(
    workspaceTemplateLibraryDeniedReason("free") ?? "",
    /template library/i,
  );
  assert.equal(workspaceTemplateLibraryDeniedReason("agency"), null);
});

test("clampFeaturedRosterLimitForPlan caps free at five profiles", () => {
  assert.equal(clampFeaturedRosterLimitForPlan("free", 10), 5);
  assert.equal(clampFeaturedRosterLimitForPlan("free", 0), 1);
  assert.equal(clampFeaturedRosterLimitForPlan("free", undefined), 5);
  assert.equal(clampFeaturedRosterLimitForPlan("studio", 10), null);
});

test("domain eligibility stays aligned with workspace public URL policy helpers", () => {
  const plans = ["free", "studio", "agency", "network", "legacy"] as const;
  for (const plan of plans) {
    const policy = getBuilderPlanPolicy(plan);
    assert.equal(policy.brandedSubdomainEligible, brandedSubdomainEligible(plan));
    assert.equal(policy.customDomainEligible, customDomainEligible(plan));
  }
});
