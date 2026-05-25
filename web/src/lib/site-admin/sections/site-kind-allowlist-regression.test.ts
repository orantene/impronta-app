import test from "node:test";
import assert from "node:assert/strict";

import {
  listVisibleSectionsForSiteKind,
  sectionAllowedForSiteKind,
} from "@/lib/site-admin/sections/site-kind-allowlist";
import { listAgencyVisibleSections } from "@/lib/site-admin/sections/registry";

test("agency builder registry unchanged — tenant-only sections still agency-visible", () => {
  const agencyKeys = listAgencyVisibleSections().map((e) => e.meta.key);
  assert.ok(agencyKeys.includes("directory"));
  assert.ok(agencyKeys.includes("featured_talent"));
  assert.ok(agencyKeys.includes("category_grid"));
  assert.ok(agencyKeys.includes("site_header"));
  assert.ok(agencyKeys.includes("site_footer"));
});

test("talent_personal allowlist excludes agency-only sections", () => {
  for (const key of [
    "directory",
    "featured_talent",
    "category_grid",
    "site_header",
    "site_footer",
  ]) {
    assert.equal(sectionAllowedForSiteKind(key, "talent_personal"), false);
    assert.equal(sectionAllowedForSiteKind(key, "agency"), true);
  }
});

test("agency and hub site kinds keep full agency-visible library", () => {
  const current = listAgencyVisibleSections().map((e) => e.meta.key).sort();
  const agency = listVisibleSectionsForSiteKind("agency").map((e) => e.meta.key).sort();
  const hub = listVisibleSectionsForSiteKind("hub").map((e) => e.meta.key).sort();
  assert.deepEqual(agency, current);
  assert.deepEqual(hub, current);
});
