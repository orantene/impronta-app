// Pins the seeding rule. Each assertion here corresponds to a way a new tenant
// gets a broken picker, and most of them are things that ALREADY went wrong on
// the live platform:
//
//   • a sparse write leaves the rest of the catalog enabled (absence = enabled)
//   • categories offered as primary roles (532 selectable today)
//   • custom_label_i18n copied instead of NULL (100% non-null today)
//   • a typo in the signup path silently producing an empty picker

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTenantTaxonomySeed,
  collectSubtreeIds,
  isTaxonomyVerticalSlug,
  resolveVerticalRoot,
  TAXONOMY_VERTICAL_SLUGS,
  type SeedTermRow,
} from "./seed-tenant-taxonomy-core";

// models > fashion > runway-model / fitting-model, plus a separate vertical.
const TERMS: SeedTermRow[] = [
  { id: "models", parent_id: null, level: 1, slug: "models" },
  { id: "fashion", parent_id: "models", level: 2, slug: "fashion" },
  { id: "runway", parent_id: "fashion", level: 3, slug: "runway-model" },
  { id: "fitting", parent_id: "fashion", level: 3, slug: "fitting-model" },
  { id: "chefs", parent_id: null, level: 1, slug: "chefs-culinary" },
  { id: "private", parent_id: "chefs", level: 2, slug: "private-dining" },
  { id: "chef", parent_id: "private", level: 3, slug: "private-chef" },
  { id: "orphan", parent_id: null, level: 1, slug: "unmapped-thing" },
];

const byKey = (rows: ReturnType<typeof buildTenantTaxonomySeed>) =>
  new Map(rows.map((r) => [r.taxonomy_term_id, r]));

test("every active term gets a row, because absence means enabled", () => {
  // The whole reason a sparse seed is unsafe. If this ever returns fewer rows
  // than terms, the unwritten ones are silently ON.
  const rows = buildTenantTaxonomySeed({ terms: TERMS, verticalSlug: "models" });
  assert.equal(rows.length, TERMS.length);
});

test("only the chosen vertical's subtree is enabled", () => {
  const m = byKey(buildTenantTaxonomySeed({ terms: TERMS, verticalSlug: "models" }));
  for (const id of ["models", "fashion", "runway", "fitting"]) {
    assert.equal(m.get(id)!.is_enabled, true, `${id} should be enabled`);
  }
  for (const id of ["chefs", "private", "chef", "orphan"]) {
    assert.equal(m.get(id)!.is_enabled, false, `${id} should be disabled`);
  }
});

test("allow_as_primary is level 3 only — categories are never a primary role", () => {
  // 532 terms are currently selectable as a primary role platform-wide. This
  // is the assertion that keeps it from happening again.
  const m = byKey(buildTenantTaxonomySeed({ terms: TERMS, verticalSlug: "models" }));
  assert.equal(m.get("runway")!.allow_as_primary, true);
  assert.equal(m.get("fitting")!.allow_as_primary, true);
  assert.equal(m.get("models")!.allow_as_primary, false, "level 1 is a category");
  assert.equal(m.get("fashion")!.allow_as_primary, false, "level 2 is a category");
  // Disabled level-3 terms are not selectable either.
  assert.equal(m.get("chef")!.allow_as_primary, false);
});

test("show_in_registration follows is_enabled", () => {
  const m = byKey(buildTenantTaxonomySeed({ terms: TERMS, verticalSlug: "chefs-culinary" }));
  for (const r of m.values()) assert.equal(r.show_in_registration, r.is_enabled);
});

test("custom_label_i18n is NULL, never a copy of the platform label", () => {
  // The live table has this non-null on 100% of rows, which makes "has this
  // agency renamed anything?" unanswerable. Do not reproduce it.
  const rows = buildTenantTaxonomySeed({ terms: TERMS, verticalSlug: "models" });
  for (const r of rows) assert.equal(r.custom_label_i18n, null);
});

test("a null vertical disables everything — the honest empty picker", () => {
  // A laundry, an immigration office, a jeweller. Nothing in the catalog fits,
  // and an empty picker beats a wrong one.
  const rows = buildTenantTaxonomySeed({ terms: TERMS, verticalSlug: null });
  assert.equal(rows.length, TERMS.length);
  assert.ok(rows.every((r) => !r.is_enabled));
  assert.ok(rows.every((r) => !r.allow_as_primary));
});

test("an unknown vertical throws instead of seeding nothing", () => {
  // A typo must fail loudly: an empty picker looks identical whether it was
  // intended or misspelled.
  assert.throws(
    () => buildTenantTaxonomySeed({ terms: TERMS, verticalSlug: "chefs_culinary" }),
    /unknown vertical/,
  );
  assert.throws(
    () => buildTenantTaxonomySeed({ terms: TERMS, verticalSlug: "Models" }),
    /unknown vertical/,
  );
});

test("a known slug missing from the catalog throws rather than seeding empty", () => {
  // Catalog drift must surface, not degrade to a blank picker.
  assert.throws(
    () =>
      buildTenantTaxonomySeed({
        terms: TERMS.filter((t) => t.slug !== "models"),
        verticalSlug: "models",
      }),
    /catalog and this list have drifted/,
  );
});

test("the vertical list matches what the slug guard accepts", () => {
  for (const slug of TAXONOMY_VERTICAL_SLUGS) assert.ok(isTaxonomyVerticalSlug(slug));
  assert.ok(!isTaxonomyVerticalSlug("nope"));
  assert.ok(!isTaxonomyVerticalSlug(null));
  assert.equal(TAXONOMY_VERTICAL_SLUGS.length, 19);
});

test("subtree collection survives a cycle", () => {
  // A malformed parent chain must not hang tenant creation.
  const cyclic: SeedTermRow[] = [
    { id: "a", parent_id: "c", level: 1, slug: "a" },
    { id: "b", parent_id: "a", level: 2, slug: "b" },
    { id: "c", parent_id: "b", level: 3, slug: "c" },
  ];
  const ids = collectSubtreeIds("a", cyclic);
  assert.deepEqual([...ids].sort(), ["a", "b", "c"]);
});

test("the ancestor walk is bounded and finds the level-1 root", () => {
  assert.equal(resolveVerticalRoot("runway", TERMS)?.slug, "models");
  assert.equal(resolveVerticalRoot("chef", TERMS)?.slug, "chefs-culinary");
  assert.equal(resolveVerticalRoot("missing", TERMS), null);
  const cyclic: SeedTermRow[] = [
    { id: "x", parent_id: "y", level: 3, slug: "x" },
    { id: "y", parent_id: "x", level: 3, slug: "y" },
  ];
  assert.equal(resolveVerticalRoot("x", cyclic), null, "a cycle terminates");
});
