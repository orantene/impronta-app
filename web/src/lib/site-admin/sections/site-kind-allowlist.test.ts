import test from "node:test";
import assert from "node:assert/strict";

import {
  TALENT_PERSONAL_SECTION_TYPE_KEYS,
  TENANT_ONLY_SECTION_TYPE_KEYS,
  listVisibleSectionsForSiteKind,
  sectionAllowedForSiteKind,
} from "@/lib/site-admin/sections/site-kind-allowlist";
import { getSectionType, listAgencyVisibleSections } from "@/lib/site-admin/sections/registry";

test("talent personal site allowlist references real agency-visible sections", () => {
  for (const key of TALENT_PERSONAL_SECTION_TYPE_KEYS) {
    const entry = getSectionType(key);
    assert.ok(entry, `section ${key} must be registered`);
    assert.equal(entry?.meta.visibleToAgency, true, `section ${key} must be addable`);
  }
});

test("tenant-only sections are blocked for talent personal sites", () => {
  for (const key of TENANT_ONLY_SECTION_TYPE_KEYS) {
    assert.equal(
      sectionAllowedForSiteKind(key, "talent_personal"),
      false,
      `${key} must not appear in the Talent Max section library`,
    );
  }
});

test("agency and hub builders keep the existing agency-visible registry", () => {
  const agencyKeys = listVisibleSectionsForSiteKind("agency").map((entry) => entry.meta.key).sort();
  const hubKeys = listVisibleSectionsForSiteKind("hub").map((entry) => entry.meta.key).sort();
  const currentKeys = listAgencyVisibleSections().map((entry) => entry.meta.key).sort();

  assert.deepEqual(agencyKeys, currentKeys);
  assert.deepEqual(hubKeys, currentKeys);
});

test("talent personal section library is a conservative subset", () => {
  const talentKeys = listVisibleSectionsForSiteKind("talent_personal").map((entry) => entry.meta.key);

  assert.ok(talentKeys.length > 0, "talent library should not be empty");
  assert.ok(talentKeys.includes("hero"), "talent library should include a hero section");
  assert.ok(talentKeys.includes("gallery_strip"), "talent library should include gallery support");
  assert.equal(talentKeys.includes("directory"), false);
  assert.equal(talentKeys.includes("featured_talent"), false);
  assert.equal(talentKeys.includes("category_grid"), false);
});
