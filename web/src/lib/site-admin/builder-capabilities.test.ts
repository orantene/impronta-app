import assert from "node:assert/strict";
import { test } from "node:test";

import {
  builderPlanAllows,
  clampFeaturedRosterLimitForPlan,
  cmsAdditionalPageDeniedReason,
  countQuotaCountedPages,
  getBuilderPlanPolicy,
  isQuotaCountedPage,
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

test("cmsAdditionalPageDeniedReason blocks free without a count, allows paid plans", () => {
  // No count supplied means "unmetered" — fail closed, as before.
  assert.match(cmsAdditionalPageDeniedReason("free") ?? "", /one page of your own/i);
  assert.equal(cmsAdditionalPageDeniedReason("studio"), null);
});

// ── DEFAULT PAGES CONTRACT — system/role pages do not consume the quota ─────
//
// Free caps at ONE page. The seed alone provisions a homepage and a 404, and a
// roster workspace also gets a directory page. If those counted, a brand-new
// Free workspace would be over quota before its owner clicked anything, and the
// non-negotiable set would be impossible to ship. So the quota counts only what
// the operator chose to build.

test("the seeded default pages do not count against the quota", () => {
  const roleSlugs = new Set(["404"]);
  const seeded = [
    { slug: "", system_template_key: "homepage", status: "published" },
    { slug: "__site_shell__", system_template_key: "site_shell", status: "published" },
    { slug: "__directory__", system_template_key: "directory", status: "published" },
    // The 404 carries no system_template_key — it is an ordinary editable page
    // that HOLDS the notFound role. The role pointer is what exempts it.
    { slug: "404", system_template_key: null, status: "published" },
  ];
  assert.equal(countQuotaCountedPages(seeded, roleSlugs), 0);
  // …so a fresh Free workspace still has its one page of its own to spend.
  assert.equal(cmsAdditionalPageDeniedReason("free", 0), null);
});

test("a Free workspace gets exactly one operator page on top of the defaults", () => {
  const roleSlugs = new Set(["404"]);
  const rows = [
    { slug: "", system_template_key: "homepage", status: "published" },
    { slug: "404", system_template_key: null, status: "published" },
    { slug: "about", system_template_key: null, status: "draft" },
  ];
  assert.equal(countQuotaCountedPages(rows, roleSlugs), 1);
  assert.match(
    cmsAdditionalPageDeniedReason("free", 1) ?? "",
    /one page of your own/i,
  );
});

test("promoting a page to a role stops it billing against the quota", () => {
  const rows = [{ slug: "welcome", system_template_key: null, status: "published" }];
  assert.equal(countQuotaCountedPages(rows, new Set()), 1);
  assert.equal(countQuotaCountedPages(rows, new Set(["welcome"])), 0);
});

test("archived and system-owned rows never count", () => {
  assert.equal(
    isQuotaCountedPage({ slug: "old", status: "archived" }),
    false,
  );
  assert.equal(
    isQuotaCountedPage({ slug: "locked", status: "published", is_system_owned: true }),
    false,
  );
  assert.equal(isQuotaCountedPage({ slug: "about", status: "published" }), true);
});

test("a paid plan is never metered", () => {
  assert.equal(cmsAdditionalPageDeniedReason("studio", 500), null);
  assert.equal(cmsAdditionalPageDeniedReason("agency", null), null);
});

test("a failed count fails CLOSED, never into unlimited pages", () => {
  // loadQuotaCountedPageCount returns null when the read errors.
  assert.ok(cmsAdditionalPageDeniedReason("free", null));
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
  const plans = ["free", "website", "studio", "agency", "network", "legacy"] as const;
  for (const plan of plans) {
    const policy = getBuilderPlanPolicy(plan);
    assert.equal(policy.brandedSubdomainEligible, brandedSubdomainEligible(plan));
    assert.equal(policy.customDomainEligible, customDomainEligible(plan));
  }
});

test("website plan policy: full builder, custom domain, no roster clamp", () => {
  assert.equal(normalizeBuilderWorkspacePlan("website"), "website");

  const policy = getBuilderPlanPolicy("website");
  assert.equal(policy.maxPublicPages, null);
  // Roster visibility is a workspace-TYPE concern, not a plan concern. The
  // roster cap that bites on Website is PLAN_SEAT_CAPS.website = 0, and a 0
  // here would be clamped up to 1 by clampFeaturedRosterLimitForPlan.
  assert.equal(policy.maxVisibleRosterProfiles, null);
  assert.equal(policy.workspaceTemplateLibrary, true);
  assert.equal(policy.starterTemplateMode, "paid");
  assert.equal(policy.shellEditMode, "full");
  assert.equal(policy.brandedSubdomainEligible, true);
  assert.equal(policy.customDomainEligible, true);

  assert.equal(builderPlanAllows("website", "builder.shell.edit"), true);
  assert.equal(builderPlanAllows("website", "builder.domain.subdomain"), true);
  assert.equal(builderPlanAllows("website", "builder.domain.custom"), true);
  assert.equal(clampFeaturedRosterLimitForPlan("website", 12), null);
  assert.equal(cmsAdditionalPageDeniedReason("website"), null);
  assert.equal(workspaceTemplateLibraryDeniedReason("website"), null);
});
