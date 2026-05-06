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
});

test("studio plan policy enables template library and basic shell editing", () => {
  const policy = getBuilderPlanPolicy("studio");
  assert.equal(policy.workspaceTemplateLibrary, true);
  assert.equal(policy.shellEditMode, "basic");
});

test("agency and network plan policies allow full shell editing", () => {
  assert.equal(getBuilderPlanPolicy("agency").shellEditMode, "full");
  assert.equal(getBuilderPlanPolicy("network").shellEditMode, "full");
});

test("builder capability gates keep free shell locked but body editable", () => {
  assert.equal(builderPlanAllows("free", "builder.shell.edit"), false);
  assert.equal(builderPlanAllows("free", "builder.section.body.edit"), true);
  assert.equal(builderPlanAllows("studio", "builder.shell.edit"), true);
});

test("resolveStarterTemplateSlugs keeps free plan on free starter only", () => {
  const all = ["free-quickstart-5", "classic", "studio-minimal"];
  assert.deepEqual(resolveStarterTemplateSlugs("free", all), [
    "free-quickstart-5",
  ]);
  assert.deepEqual(resolveStarterTemplateSlugs("studio", all), [
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
