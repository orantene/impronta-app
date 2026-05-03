import test from "node:test";
import assert from "node:assert/strict";

import {
  isTalentTypeTerm,
  isParentCategoryTerm,
  extractPrimaryRoleTerm,
  extractSecondaryRoleTerms,
  extractTermsByRelationship,
  getParentCategoryFromMap,
  getLineageFromMap,
  type TermShape,
} from "@/lib/taxonomy/engine";

// ────────────────────────────────────────────────────────────────────────
// Predicates
// ────────────────────────────────────────────────────────────────────────

test("isTalentTypeTerm: v2 term_type wins over legacy kind", () => {
  assert.equal(isTalentTypeTerm({ term_type: "talent_type", kind: "tag" }), true);
  assert.equal(isTalentTypeTerm({ term_type: "specialty", kind: "talent_type" }), false);
});

test("isTalentTypeTerm: legacy fallback when term_type is null", () => {
  assert.equal(isTalentTypeTerm({ term_type: null, kind: "talent_type" }), true);
  assert.equal(isTalentTypeTerm({ kind: "talent_type" }), true);
  assert.equal(isTalentTypeTerm({ kind: "skill" }), false);
});

test("isParentCategoryTerm: only true for v2 parent_category", () => {
  assert.equal(isParentCategoryTerm({ term_type: "parent_category" }), true);
  assert.equal(isParentCategoryTerm({ term_type: "talent_type" }), false);
  assert.equal(isParentCategoryTerm({}), false);
});

// ────────────────────────────────────────────────────────────────────────
// Primary/secondary extraction
// ────────────────────────────────────────────────────────────────────────

const fashionModel: TermShape = { id: "t-fashion", slug: "fashion-model", name_en: "Fashion Model", term_type: "talent_type", parent_id: "g-fashion-models" };
const promoModel: TermShape = { id: "t-promo", slug: "promotional-model", name_en: "Promotional Model", term_type: "talent_type", parent_id: "g-promo-models" };
const luxurySales: TermShape = { id: "s-luxury-sales", slug: "luxury-sales", name_en: "Luxury Sales", term_type: "skill" };

test("extractPrimaryRoleTerm: v2 relationship_type wins", () => {
  const rows = [
    { relationship_type: "secondary_role", taxonomy_terms: fashionModel },
    { relationship_type: "primary_role", taxonomy_terms: promoModel },
  ];
  const t = extractPrimaryRoleTerm(rows);
  assert.equal(t?.id, "t-promo");
});

test("extractPrimaryRoleTerm: legacy fallback to is_primary + kind", () => {
  const rows = [
    { is_primary: false, taxonomy_terms: { ...fashionModel, term_type: null, kind: "talent_type" } },
    { is_primary: true,  taxonomy_terms: { ...promoModel,   term_type: null, kind: "talent_type" } },
  ];
  const t = extractPrimaryRoleTerm(rows);
  assert.equal(t?.id, "t-promo");
});

test("extractPrimaryRoleTerm: ignores is_primary on non-talent_type", () => {
  const rows = [
    { is_primary: true, taxonomy_terms: { ...luxurySales, term_type: null, kind: "skill" } },
  ];
  assert.equal(extractPrimaryRoleTerm(rows), null);
});

test("extractPrimaryRoleTerm: returns null when none", () => {
  assert.equal(extractPrimaryRoleTerm([]), null);
  assert.equal(extractPrimaryRoleTerm([{ relationship_type: "skill", taxonomy_terms: luxurySales }]), null);
});

test("extractSecondaryRoleTerms: v2 path", () => {
  const rows = [
    { relationship_type: "primary_role", taxonomy_terms: promoModel },
    { relationship_type: "secondary_role", taxonomy_terms: fashionModel },
  ];
  const out = extractSecondaryRoleTerms(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "t-fashion");
});

test("extractSecondaryRoleTerms: legacy fallback (non-primary talent_type)", () => {
  const rows = [
    { is_primary: true,  taxonomy_terms: { ...promoModel,   term_type: null, kind: "talent_type" } },
    { is_primary: false, taxonomy_terms: { ...fashionModel, term_type: null, kind: "talent_type" } },
  ];
  const out = extractSecondaryRoleTerms(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "t-fashion");
});

test("extractTermsByRelationship: skills only", () => {
  const rows = [
    { relationship_type: "primary_role", taxonomy_terms: promoModel },
    { relationship_type: "skill", taxonomy_terms: luxurySales },
  ];
  const out = extractTermsByRelationship(rows, "skill");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "s-luxury-sales");
});

// ────────────────────────────────────────────────────────────────────────
// Parent walk + lineage
// ────────────────────────────────────────────────────────────────────────

const parents: TermShape[] = [
  { id: "p-models", slug: "models", name_en: "Models", term_type: "parent_category", parent_id: null },
  { id: "g-fashion-models", slug: "fashion-models", name_en: "Fashion Models", term_type: "category_group", parent_id: "p-models" },
  { id: "t-fashion-model", slug: "fashion-model", name_en: "Fashion Model", term_type: "talent_type", parent_id: "g-fashion-models" },
  { id: "p-performers", slug: "performers", name_en: "Performers", term_type: "parent_category", parent_id: null },
  { id: "g-dancers", slug: "dancers", name_en: "Dancers", term_type: "category_group", parent_id: "p-performers" },
  { id: "t-fire-dancer", slug: "fire-dancer", name_en: "Fire Dancer", term_type: "talent_type", parent_id: "g-dancers" },
];
const termMap = new Map(parents.map((t) => [t.id, t]));

test("getParentCategoryFromMap: walks up to parent_category", () => {
  const p = getParentCategoryFromMap("t-fire-dancer", termMap);
  assert.equal(p?.id, "p-performers");
});

test("getParentCategoryFromMap: parent_category resolves to itself", () => {
  const p = getParentCategoryFromMap("p-performers", termMap);
  assert.equal(p?.id, "p-performers");
});

test("getParentCategoryFromMap: returns null when chain breaks", () => {
  const p = getParentCategoryFromMap("does-not-exist", termMap);
  assert.equal(p, null);
});

test("getLineageFromMap: returns root-to-leaf path", () => {
  const lineage = getLineageFromMap("t-fire-dancer", termMap);
  assert.deepEqual(
    lineage.map((t) => t.slug),
    ["performers", "dancers", "fire-dancer"],
  );
});

test("getLineageFromMap: lone parent yields single-entry path", () => {
  const lineage = getLineageFromMap("p-models", termMap);
  assert.equal(lineage.length, 1);
  assert.equal(lineage[0].slug, "models");
});
