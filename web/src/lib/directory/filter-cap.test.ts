import test from "node:test";
import assert from "node:assert/strict";

import {
  DIRECTORY_FILTER_CAP,
  countAppliedDirectoryFilters,
  isDirectoryFilterCapReached,
  type DirectoryFilterCountInput,
} from "./filter-cap";

const EMPTY: DirectoryFilterCountInput = {
  selectedTaxonomyIds: [],
  heightMinCm: null,
  heightMaxCm: null,
  ageMin: null,
  ageMax: null,
  query: null,
  locationSlug: null,
  fieldFacets: [],
};

function input(overrides: Partial<DirectoryFilterCountInput>): DirectoryFilterCountInput {
  return { ...EMPTY, ...overrides };
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

test("empty input counts as zero", () => {
  assert.equal(countAppliedDirectoryFilters(EMPTY), 0);
});

test("DIRECTORY_FILTER_CAP is a positive integer", () => {
  assert.equal(typeof DIRECTORY_FILTER_CAP, "number");
  assert.ok(Number.isInteger(DIRECTORY_FILTER_CAP));
  assert.ok(DIRECTORY_FILTER_CAP > 0);
});

// ---------------------------------------------------------------------------
// Taxonomy IDs
// ---------------------------------------------------------------------------

test("each taxonomy id counts as one", () => {
  assert.equal(
    countAppliedDirectoryFilters(input({ selectedTaxonomyIds: ["a"] })),
    1,
  );
  assert.equal(
    countAppliedDirectoryFilters(input({ selectedTaxonomyIds: ["a", "b", "c"] })),
    3,
  );
});

// ---------------------------------------------------------------------------
// Height / age ranges — any bound = one chip
// ---------------------------------------------------------------------------

test("height range: min-only counts as one", () => {
  assert.equal(countAppliedDirectoryFilters(input({ heightMinCm: 165 })), 1);
});

test("height range: max-only counts as one", () => {
  assert.equal(countAppliedDirectoryFilters(input({ heightMaxCm: 185 })), 1);
});

test("height range: both bounds still count as one chip", () => {
  assert.equal(
    countAppliedDirectoryFilters(input({ heightMinCm: 165, heightMaxCm: 185 })),
    1,
  );
});

test("age range: any bound counts as one chip", () => {
  assert.equal(countAppliedDirectoryFilters(input({ ageMin: 21 })), 1);
  assert.equal(countAppliedDirectoryFilters(input({ ageMax: 35 })), 1);
  assert.equal(
    countAppliedDirectoryFilters(input({ ageMin: 21, ageMax: 35 })),
    1,
  );
});

test("height and age ranges together count as two", () => {
  assert.equal(
    countAppliedDirectoryFilters(
      input({ heightMinCm: 165, ageMin: 21 }),
    ),
    2,
  );
});

// ---------------------------------------------------------------------------
// Query + location
// ---------------------------------------------------------------------------

test("non-empty query counts as one", () => {
  assert.equal(countAppliedDirectoryFilters(input({ query: "gina" })), 1);
});

test("whitespace-only query counts as zero", () => {
  assert.equal(countAppliedDirectoryFilters(input({ query: "   " })), 0);
});

test("empty-string query counts as zero", () => {
  assert.equal(countAppliedDirectoryFilters(input({ query: "" })), 0);
});

test("non-empty location slug counts as one", () => {
  assert.equal(
    countAppliedDirectoryFilters(input({ locationSlug: "mexico-cancun" })),
    1,
  );
});

test("empty location slug counts as zero", () => {
  assert.equal(countAppliedDirectoryFilters(input({ locationSlug: "" })), 0);
});

// ---------------------------------------------------------------------------
// Field facets — each non-empty entry = one chip, empty entries ignored
// ---------------------------------------------------------------------------

test("field facets: each non-empty entry counts as one", () => {
  assert.equal(
    countAppliedDirectoryFilters(
      input({
        fieldFacets: [
          { fieldKey: "hair_color", values: ["brown"] },
          { fieldKey: "eye_color", values: ["blue", "green"] },
        ],
      }),
    ),
    2,
  );
});

test("field facets: empty-values entries are ignored", () => {
  assert.equal(
    countAppliedDirectoryFilters(
      input({
        fieldFacets: [
          { fieldKey: "hair_color", values: [] },
          { fieldKey: "eye_color", values: ["blue"] },
        ],
      }),
    ),
    1,
  );
});

test("field facets: multi-value facet still counts as one chip", () => {
  assert.equal(
    countAppliedDirectoryFilters(
      input({
        fieldFacets: [
          { fieldKey: "tags", values: ["a", "b", "c", "d"] },
        ],
      }),
    ),
    1,
  );
});

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

test("mixed input: all rules compose additively", () => {
  const n = countAppliedDirectoryFilters(
    input({
      selectedTaxonomyIds: ["t1", "t2"],        // 2
      heightMinCm: 165,                         // 1
      ageMax: 35,                               // 1
      query: "gina",                            // 1
      locationSlug: "mexico-cancun",            // 1
      fieldFacets: [
        { fieldKey: "hair_color", values: ["brown"] }, // 1
        { fieldKey: "eye_color", values: [] },         // 0
      ],
    }),
  );
  assert.equal(n, 7);
});

// ---------------------------------------------------------------------------
// Cap reached helper
// ---------------------------------------------------------------------------

test("isDirectoryFilterCapReached: false well under cap", () => {
  assert.equal(isDirectoryFilterCapReached(EMPTY), false);
});

test("isDirectoryFilterCapReached: true when count equals cap", () => {
  const ids = Array.from({ length: DIRECTORY_FILTER_CAP }, (_, i) => `t${i}`);
  assert.equal(
    isDirectoryFilterCapReached(input({ selectedTaxonomyIds: ids })),
    true,
  );
});

test("isDirectoryFilterCapReached: true when count exceeds cap", () => {
  const ids = Array.from({ length: DIRECTORY_FILTER_CAP + 3 }, (_, i) => `t${i}`);
  assert.equal(
    isDirectoryFilterCapReached(input({ selectedTaxonomyIds: ids })),
    true,
  );
});

test("isDirectoryFilterCapReached: respects custom cap override", () => {
  assert.equal(
    isDirectoryFilterCapReached(input({ selectedTaxonomyIds: ["a", "b"] }), 2),
    true,
  );
  assert.equal(
    isDirectoryFilterCapReached(input({ selectedTaxonomyIds: ["a"] }), 2),
    false,
  );
});
