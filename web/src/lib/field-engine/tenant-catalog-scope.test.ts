import test from "node:test";
import assert from "node:assert/strict";
import { filterTenantCatalogFieldsByEnabledTaxonomy } from "./tenant-catalog-scope";

const fields = [
  { id: "universal-name", tier: "universal" },
  { id: "global-media", tier: "global" },
  { id: "model-height", tier: "type-specific" },
  { id: "chef-cuisine", tier: "type-specific" },
  { id: "transport-vehicle", tier: "type-specific" },
];

const terms = [
  { id: "models", parent_id: null, is_active: true },
  { id: "model-types", parent_id: "models", is_active: true },
  { id: "fashion-model", parent_id: "model-types", is_active: true },
  { id: "chefs", parent_id: null, is_active: true },
  { id: "chef-types", parent_id: "chefs", is_active: true },
  { id: "private-chef", parent_id: "chef-types", is_active: true },
  { id: "transport", parent_id: null, is_active: true },
  { id: "driver", parent_id: "transport", is_active: true },
];

const recommendations = [
  { field_definition_id: "model-height", taxonomy_term_id: "fashion-model" },
  { field_definition_id: "chef-cuisine", taxonomy_term_id: "private-chef" },
  { field_definition_id: "transport-vehicle", taxonomy_term_id: "driver" },
];

test("keeps universal/global fields and type-specific fields mapped to enabled taxonomy", () => {
  const scoped = filterTenantCatalogFieldsByEnabledTaxonomy(
    fields,
    recommendations,
    terms,
    [
      { taxonomy_term_id: "chefs", is_enabled: false },
      { taxonomy_term_id: "transport", is_enabled: false },
    ],
  );

  assert.deepEqual(
    scoped.map((field) => field.id),
    ["universal-name", "global-media", "model-height"],
  );
});

test("disabling a parent hides descendant type-specific fields", () => {
  const scoped = filterTenantCatalogFieldsByEnabledTaxonomy(
    fields,
    recommendations,
    terms,
    [{ taxonomy_term_id: "models", is_enabled: false }],
  );

  assert.deepEqual(
    scoped.map((field) => field.id),
    ["universal-name", "global-media", "chef-cuisine", "transport-vehicle"],
  );
});

test("missing tenant setting rows inherit enabled catalog defaults", () => {
  const scoped = filterTenantCatalogFieldsByEnabledTaxonomy(
    fields,
    recommendations,
    terms,
    [],
  );

  assert.deepEqual(
    scoped.map((field) => field.id),
    fields.map((field) => field.id),
  );
});
