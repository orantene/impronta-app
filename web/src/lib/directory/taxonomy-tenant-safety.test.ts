import test from "node:test";
import assert from "node:assert/strict";

import {
  ALLOW_ALL_TAXONOMY_VISIBILITY,
  filterTaxonomyTermIdsByTenantDirectorySafety,
  isTaxonomyTermVisibleForTenant,
  selectDirectoryMatchLeafTermIds,
  type DirectoryTaxonomySafetySetting,
  type DirectoryTaxonomySafetyTerm,
} from "@/lib/directory/taxonomy-tenant-safety";
import { buildTalentProfileJsonLd } from "@/lib/seo/talent-json-ld";

function terms(rows: DirectoryTaxonomySafetyTerm[]) {
  return new Map(rows.map((row) => [row.id, row] as const));
}

function settings(rows: DirectoryTaxonomySafetySetting[]) {
  return new Map(rows.map((row) => [row.taxonomy_term_id, row] as const));
}

test("directory taxonomy safety keeps enabled terms with enabled ancestors", () => {
  const result = filterTaxonomyTermIdsByTenantDirectorySafety({
    requestedTermIds: ["dj"],
    termsById: terms([
      { id: "music", parent_id: null },
      { id: "dj", parent_id: "music" },
    ]),
    settingsByTermId: settings([
      { taxonomy_term_id: "music", is_enabled: true, show_in_directory: true },
      { taxonomy_term_id: "dj", is_enabled: true, show_in_directory: true },
    ]),
  });

  assert.deepEqual(result, ["dj"]);
});

test("directory taxonomy safety hides terms disabled directly for the tenant", () => {
  const result = filterTaxonomyTermIdsByTenantDirectorySafety({
    requestedTermIds: ["chef"],
    termsById: terms([
      { id: "culinary", parent_id: null },
      { id: "chef", parent_id: "culinary" },
    ]),
    settingsByTermId: settings([
      { taxonomy_term_id: "chef", is_enabled: false, show_in_directory: true },
    ]),
  });

  assert.deepEqual(result, []);
});

test("directory taxonomy safety hides descendants when a parent is disabled", () => {
  const result = filterTaxonomyTermIdsByTenantDirectorySafety({
    requestedTermIds: ["chef"],
    termsById: terms([
      { id: "culinary", parent_id: null },
      { id: "chef", parent_id: "culinary" },
    ]),
    settingsByTermId: settings([
      { taxonomy_term_id: "culinary", is_enabled: false, show_in_directory: true },
    ]),
  });

  assert.deepEqual(result, []);
});

test("directory taxonomy safety hides terms removed from directory but still enabled internally", () => {
  const result = filterTaxonomyTermIdsByTenantDirectorySafety({
    requestedTermIds: ["security"],
    termsById: terms([{ id: "security", parent_id: null }]),
    settingsByTermId: settings([
      { taxonomy_term_id: "security", is_enabled: true, show_in_directory: false },
    ]),
  });

  assert.deepEqual(result, []);
});

// ── isTaxonomyTermVisibleForTenant — THE shared predicate behind every public
//    DISPLAY surface (directory category bar, sidebar facets, card chips, the
//    public profile). Filter input fails CLOSED on an unknown id; display
//    filtering fails OPEN, because the display maps only carry the tenant's
//    hidden subtrees. ────────────────────────────────────────────────────────

test("display filtering fails OPEN for a term outside the tenant's hidden subtrees", () => {
  // The loader only materialises the disabled roots + their descendants; a term
  // the tenant never overrode is absent from the map and must still show.
  const visible = isTaxonomyTermVisibleForTenant(
    "host",
    terms([{ id: "dancer", parent_id: null }]),
    settings([{ taxonomy_term_id: "dancer", is_enabled: false, show_in_directory: null }]),
    { unknownTermVisible: true },
  );
  assert.equal(visible, true);
});

test("filter input fails CLOSED for an unresolvable term id", () => {
  const visible = isTaxonomyTermVisibleForTenant(
    "not-a-real-term",
    terms([{ id: "dancer", parent_id: null }]),
    settings([]),
  );
  assert.equal(visible, false);
});

test("display filtering hides a descendant of a disabled category root", () => {
  const termsById = terms([
    { id: "performers", parent_id: null },
    { id: "dance", parent_id: "performers" },
    { id: "salsa-dancer", parent_id: "dance" },
  ]);
  const settingsById = settings([
    { taxonomy_term_id: "performers", is_enabled: false, show_in_directory: null },
  ]);
  for (const id of ["performers", "dance", "salsa-dancer"]) {
    assert.equal(
      isTaxonomyTermVisibleForTenant(id, termsById, settingsById, {
        unknownTermVisible: true,
      }),
      false,
      `${id} must be hidden under a disabled root`,
    );
  }
});

test("the allow-all visibility object shows every term", () => {
  assert.equal(ALLOW_ALL_TAXONOMY_VISIBILITY.isTermVisible("anything"), true);
  assert.equal(ALLOW_ALL_TAXONOMY_VISIBILITY.unrestricted, true);
});

// ── HAZARD: a talent whose EVERY category the tenant disabled. The surfaces
//    must degrade to a documented fallback, never to empty markup. ───────────

test("a talent whose every category is disabled resolves to zero visible terms", () => {
  const termsById = terms([
    { id: "performers", parent_id: null },
    { id: "dancer", parent_id: "performers" },
  ]);
  const settingsById = settings([
    { taxonomy_term_id: "performers", is_enabled: false, show_in_directory: null },
  ]);
  // "Dancer" is this talent's ONLY tag.
  const visibleTermIds = ["dancer"].filter((id) =>
    isTaxonomyTermVisibleForTenant(id, termsById, settingsById, {
      unknownTermVisible: true,
    }),
  );
  assert.deepEqual(visibleTermIds, []);
  // Contract for the callers: an empty list yields NO chips and a null primary
  // type — never a chip with an empty label.
  assert.equal(visibleTermIds.length === 0 ? null : visibleTermIds[0], null);
});

test("JSON-LD OMITS jobTitle entirely when every category is hidden", () => {
  // The deliberate fallback: `primaryTalentType()` returns null, and the
  // profile emits a Person with no `jobTitle` key rather than `jobTitle: ""`.
  const jsonLd = buildTalentProfileJsonLd({
    canonicalUrl: "https://example.test/t/TAL-1",
    name: "Ada Talent",
    jobTitle: null,
    inLanguage: "en",
  }) as { mainEntity: Record<string, unknown> };

  assert.equal("jobTitle" in jsonLd.mainEntity, false);
  assert.equal(jsonLd.mainEntity.name, "Ada Talent");
});

test("JSON-LD keeps jobTitle when a category survives the tenant override", () => {
  const jsonLd = buildTalentProfileJsonLd({
    canonicalUrl: "https://example.test/t/TAL-1",
    name: "Ada Talent",
    jobTitle: "Host",
    inLanguage: "en",
  }) as { mainEntity: Record<string, unknown> };

  assert.equal(jsonLd.mainEntity.jobTitle, "Host");
});

// ── selectDirectoryMatchLeafTermIds — resolve a group filter to its tagged
//    leaves so a parent_category / category_group filter matches talent (which
//    are only tagged at the talent_type leaf level). ───────────────────────────

test("leaf resolution expands a parent group to its descendant leaves", () => {
  // models (parent_category) → fashion-models (category_group) → 2 talent_types.
  const result = selectDirectoryMatchLeafTermIds({
    requestedTermIds: ["models"],
    termsById: terms([
      { id: "models", parent_id: null },
      { id: "fashion-models", parent_id: "models" },
      { id: "fashion-model", parent_id: "fashion-models" },
      { id: "runway-model", parent_id: "fashion-models" },
    ]),
  });
  assert.deepEqual(result.sort(), ["fashion-model", "runway-model"]);
});

test("leaf resolution leaves a granular (leaf) request unchanged", () => {
  // A directory pill requests a single talent_type leaf → matches itself only.
  const result = selectDirectoryMatchLeafTermIds({
    requestedTermIds: ["fashion-model"],
    termsById: terms([
      { id: "fashion-models", parent_id: "models" },
      { id: "fashion-model", parent_id: "fashion-models" },
      { id: "runway-model", parent_id: "fashion-models" },
    ]),
  });
  assert.deepEqual(result, ["fashion-model"]);
});

test("leaf resolution unions leaves across multiple requested groups", () => {
  const result = selectDirectoryMatchLeafTermIds({
    requestedTermIds: ["models", "performers"],
    termsById: terms([
      { id: "models", parent_id: null },
      { id: "fashion-model", parent_id: "models" },
      { id: "performers", parent_id: null },
      { id: "dj", parent_id: "performers" },
      { id: "host", parent_id: "performers" },
    ]),
  });
  assert.deepEqual(result.sort(), ["dj", "fashion-model", "host"]);
});
