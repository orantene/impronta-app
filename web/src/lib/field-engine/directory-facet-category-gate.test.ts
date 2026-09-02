// Pins the RULE of the directory facet category gate.
//
// The gate decides whether a directory facet is justified by a tenant's roster.
// Its three escape hatches are load-bearing and easy to "tidy" into a bug, so
// each one is asserted here rather than left to the module comment:
//
//   • an ungrouped field is universal          → never suppressed
//   • an unmapped group is "not yet scoped"    → never suppressed
//   • an unresolvable roster                   → suppress nothing (fail open)
//
// The suppression itself is asserted too, since that is the whole feature.

import assert from "node:assert/strict";
import test from "node:test";

/**
 * Pure re-implementation of the decision in `_buildGateUncached`, fed the same
 * three inputs the DB provides. The module itself is not imported: it pulls in
 * `next/cache`, `react` and a service-role Supabase client at module scope,
 * none of which exist in the plain-node test lane (see
 * reference_server_only_import_breaks_test_lanes). What must not drift is the
 * RULE, so the rule is what is pinned.
 */
function suppressedKeys(input: {
  rosterCategories: string[];
  /** field_group_id → parent categories it serves. */
  mappings: Array<{ field_group_id: string; parent_category_id: string }>;
  /** Only fields WITH a group reach the decision; ungrouped are filtered upstream. */
  defs: Array<{ field_key: string; field_group_id: string | null }>;
}): Set<string> {
  const roster = new Set(input.rosterCategories);
  if (roster.size === 0) return new Set(); // fail open

  const byGroup = new Map<string, Set<string>>();
  for (const m of input.mappings) {
    if (!byGroup.has(m.field_group_id)) byGroup.set(m.field_group_id, new Set());
    byGroup.get(m.field_group_id)!.add(m.parent_category_id);
  }
  if (byGroup.size === 0) return new Set();

  const out = new Set<string>();
  for (const d of input.defs) {
    if (!d.field_group_id) continue; // rule 1 — ungrouped is universal
    const cats = byGroup.get(d.field_group_id);
    if (!cats || cats.size === 0) continue; // rule 2 — unmapped is not-yet-scoped
    let served = false;
    for (const c of cats) if (roster.has(c)) { served = true; break; }
    if (!served) out.add(d.field_key);
  }
  return out;
}

const CASTING = "grp-physical-casting";
const RATES = "grp-rates-booking";
const MODELS = "cat-models";
const CHEFS = "cat-chefs";

const MAPPINGS = [
  { field_group_id: CASTING, parent_category_id: MODELS },
  { field_group_id: RATES, parent_category_id: MODELS },
  { field_group_id: RATES, parent_category_id: CHEFS },
];

const DEFS = [
  { field_key: "physical.dress_size", field_group_id: CASTING },
  { field_key: "physical.height_cm", field_group_id: CASTING },
  { field_key: "commercial.askForQuote", field_group_id: RATES },
  { field_key: "identity.gender", field_group_id: null },
];

test("a chef-only roster loses the casting facets and keeps the universal ones", () => {
  const s = suppressedKeys({ rosterCategories: [CHEFS], mappings: MAPPINGS, defs: DEFS });
  assert.ok(s.has("physical.dress_size"), "dress size is casting-only");
  assert.ok(s.has("physical.height_cm"), "height is casting-only");
  assert.ok(!s.has("commercial.askForQuote"), "rates serve chefs too");
  assert.ok(!s.has("identity.gender"), "ungrouped fields stay universal");
});

test("a modelling roster keeps every casting facet", () => {
  // Impronta is this case. The gate must be a no-op for them.
  const s = suppressedKeys({ rosterCategories: [MODELS], mappings: MAPPINGS, defs: DEFS });
  assert.equal(s.size, 0);
});

test("a mixed roster keeps a facet any one category justifies", () => {
  const s = suppressedKeys({ rosterCategories: [MODELS, CHEFS], mappings: MAPPINGS, defs: DEFS });
  assert.equal(s.size, 0);
});

test("an unresolvable roster suppresses nothing (fail open)", () => {
  // A read error, an empty roster, or a brand-new tenant must never blank the
  // filter sidebar. Showing a facet that matches nothing is the smaller harm.
  const s = suppressedKeys({ rosterCategories: [], mappings: MAPPINGS, defs: DEFS });
  assert.equal(s.size, 0);
});

test("a group nobody has mapped yet suppresses nothing", () => {
  // Otherwise the day someone adds a field group, every field in it silently
  // vanishes from every directory on the platform.
  const s = suppressedKeys({
    rosterCategories: [CHEFS],
    mappings: [],
    defs: DEFS,
  });
  assert.equal(s.size, 0);
});

test("an ungrouped field is never suppressed, whatever the roster", () => {
  for (const roster of [[MODELS], [CHEFS], [MODELS, CHEFS]]) {
    const s = suppressedKeys({ rosterCategories: roster, mappings: MAPPINGS, defs: DEFS });
    assert.ok(!s.has("identity.gender"));
  }
});
