import assert from "node:assert/strict";
import test from "node:test";

import {
  collectTalentTypeLeafIds,
  isSkillTermRow,
  isTalentTypeRow,
  partitionTagScopeRows,
  type TaxonomyDescentRow,
} from "./scope-seed";

/**
 * scope-seed-parent-expansion.test.ts
 *
 * REGRESSION: `scope="by_talent_type"` configured with a PARENT category slug
 * (`term_type='parent_category'`, e.g. "models") resolved to ZERO term ids,
 * because the resolver kept only `term_type='talent_type'` rows. Zero ids is
 * indistinguishable from "no scope" downstream: the SSR seed is empty AND the
 * client grid (which rebuilds its seed signature from the ids it can see —
 * `scopeTaxonomyTermIds` in DirectoryReactiveResults) then refetches UNSCOPED.
 * Visible symptom: a division landing page silently renders the ENTIRE roster
 * instead of its own discipline, making every division page identical.
 *
 * Talent are tagged ONLY on level-3 `talent_type` terms, so a parent slug must
 * be walked down to its descendant leaves.
 */

/** models(parent) → fashion(context) → fashion-model + beauty-model (leaves) */
const TAXONOMY: Array<TaxonomyDescentRow & { parent_id: string | null }> = [
  { id: "p1", kind: "tag", term_type: "parent_category", archived_at: null, parent_id: null },
  { id: "c1", kind: "tag", term_type: "context", archived_at: null, parent_id: "p1" },
  { id: "l1", kind: "talent_type", term_type: "talent_type", archived_at: null, parent_id: "c1" },
  { id: "l2", kind: "talent_type", term_type: "talent_type", archived_at: null, parent_id: "c1" },
  { id: "l3", kind: "talent_type", term_type: "talent_type", archived_at: "2026-01-01", parent_id: "c1" },
  // A leaf under a DIFFERENT parent must never leak into the scope.
  { id: "o1", kind: "tag", term_type: "parent_category", archived_at: null, parent_id: null },
  { id: "o2", kind: "talent_type", term_type: "talent_type", archived_at: null, parent_id: "o1" },
];

const fetchChildren = async (parentIds: string[]): Promise<TaxonomyDescentRow[]> =>
  TAXONOMY.filter((r) => r.parent_id != null && parentIds.includes(r.parent_id));

test("a PARENT category id expands to its descendant talent_type leaves", async () => {
  const ids = await collectTalentTypeLeafIds(["p1"], fetchChildren);
  assert.deepEqual([...ids].sort(), ["l1", "l2"]);
  assert.notEqual(ids.length, 0, "zero ids is what made the grid refetch UNSCOPED");
  assert.ok(!ids.includes("l3"), "archived leaves must be dropped");
  assert.ok(!ids.includes("o2"), "leaves of another parent must not leak in");
});

test("descent stops cleanly at a parent with no children", async () => {
  assert.deepEqual(await collectTalentTypeLeafIds(["l1"], fetchChildren), []);
});

test("a cyclic parent link cannot spin the walk", async () => {
  const cyclic = async (): Promise<TaxonomyDescentRow[]> => [
    { id: "x1", kind: "tag", term_type: "context", archived_at: null },
  ];
  // x1 always returns itself as a child; `seen` must stop it after one visit.
  assert.deepEqual(await collectTalentTypeLeafIds(["x1"], cyclic), []);
});

test("isTalentTypeRow accepts both the v2 term_type and legacy kind shapes", () => {
  assert.equal(isTalentTypeRow({ kind: null, term_type: "talent_type" }), true);
  assert.equal(isTalentTypeRow({ kind: "talent_type", term_type: null }), true);
  assert.equal(isTalentTypeRow({ kind: "tag", term_type: "parent_category" }), false);
  assert.equal(isTalentTypeRow({ kind: "tag", term_type: "context" }), false);
});

test("isSkillTermRow accepts both the v2 term_type and legacy kind shapes", () => {
  assert.equal(isSkillTermRow({ kind: null, term_type: "skill" }), true);
  assert.equal(isSkillTermRow({ kind: "skill", term_type: null }), true);
  assert.equal(isSkillTermRow({ kind: "tag", term_type: "parent_category" }), false);
  assert.equal(isSkillTermRow({ kind: "talent_type", term_type: "talent_type" }), false);
});

test("partitionTagScopeRows keeps skills + talent types and parks parents as branches", () => {
  const { talentTypeIds, skillIds, branchIds } = partitionTagScopeRows([
    { id: "l1", kind: "talent_type", term_type: "talent_type", archived_at: null },
    { id: "s1", kind: "skill", term_type: "skill", archived_at: null },
    { id: "p1", kind: "tag", term_type: "parent_category", archived_at: null },
  ]);
  assert.deepEqual(talentTypeIds, ["l1"]);
  assert.deepEqual(skillIds, ["s1"]);
  assert.deepEqual(branchIds, ["p1"]);
  assert.ok(!talentTypeIds.includes("p1"), "parent ids must not seed as a second kind");
});
