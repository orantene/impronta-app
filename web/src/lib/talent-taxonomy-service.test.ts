import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTenantTalentTypeAvailability,
  type TalentTypeTermLookupRow,
  type TenantTaxonomyAvailabilitySetting,
} from "@/lib/talent-taxonomy-service";

function term(
  id: string,
  termType: "talent_type" | "category_group" | "parent_category",
  parentId: string | null,
  name = id,
): TalentTypeTermLookupRow {
  return {
    id,
    slug: id,
    name_en: name,
    kind: termType === "talent_type" ? "talent_type" : "attribute",
    term_type: termType,
    parent_id: parentId,
    is_active: true,
    archived_at: null,
  };
}

function setting(
  taxonomyTermId: string,
  patch: Partial<TenantTaxonomyAvailabilitySetting>,
): TenantTaxonomyAvailabilitySetting {
  return {
    taxonomy_term_id: taxonomyTermId,
    is_enabled: null,
    allow_as_primary: null,
    allow_as_secondary: null,
    ...patch,
  };
}

const model = term("editorial-model", "talent_type", "fashion-models", "Editorial Model");
const group = term("fashion-models", "category_group", "models", "Fashion Models");
const parent = term("models", "parent_category", null, "Models");
const ancestors = [group, parent];

test("tenant talent type availability allows missing workspace overrides", () => {
  const result = evaluateTenantTalentTypeAvailability({
    term: model,
    ancestors,
    settings: [],
    relationshipType: "primary_role",
  });

  assert.equal(result.ok, true);
});

test("tenant talent type availability blocks disabled parent categories", () => {
  const result = evaluateTenantTalentTypeAvailability({
    term: model,
    ancestors,
    settings: [setting("models", { is_enabled: false })],
    relationshipType: "primary_role",
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Models is disabled/);
});

test("tenant talent type availability blocks disabled category groups", () => {
  const result = evaluateTenantTalentTypeAvailability({
    term: model,
    ancestors,
    settings: [setting("fashion-models", { is_enabled: false })],
    relationshipType: "primary_role",
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Fashion Models is disabled/);
});

test("tenant talent type availability respects primary and secondary gates", () => {
  const primary = evaluateTenantTalentTypeAvailability({
    term: model,
    ancestors,
    settings: [setting("models", { allow_as_primary: false, allow_as_secondary: true })],
    relationshipType: "primary_role",
  });
  const secondary = evaluateTenantTalentTypeAvailability({
    term: model,
    ancestors,
    settings: [setting("models", { allow_as_primary: false, allow_as_secondary: true })],
    relationshipType: "secondary_role",
  });

  assert.equal(primary.ok, false);
  assert.equal(secondary.ok, true);
});

test("tenant talent type availability rejects archived talent types", () => {
  const archived = { ...model, archived_at: "2026-05-24T00:00:00.000Z" };
  const result = evaluateTenantTalentTypeAvailability({
    term: archived,
    ancestors,
    settings: [],
    relationshipType: "primary_role",
  });

  assert.equal(result.ok, false);
});
