import test from "node:test";
import assert from "node:assert/strict";

import {
  filterTaxonomyTermIdsByTenantDirectorySafety,
  type DirectoryTaxonomySafetySetting,
  type DirectoryTaxonomySafetyTerm,
} from "@/lib/directory/taxonomy-tenant-safety";

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
