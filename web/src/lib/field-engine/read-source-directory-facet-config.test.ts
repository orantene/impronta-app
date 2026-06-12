// read-source-directory-facet-config.test.ts
//
// T3.1 — unit test for the directory FACET CONFIG repoint (the facet vocab +
// slider bounds moving from legacy System A `field_definitions.config` to
// canonical System B `profile_field_definitions.directory_filter_config`).
//
// Pins the PURE config parsers + the A↔B PARITY the migration guarantees: for
// every directory-filterable key, the vocab/bounds parsed from B equal what A
// exposed — EXCEPT the 3 stale keys (availability.status / experience.level /
// travel.scope), whose B vocab is the EXPLAINED correction to the real stored
// vocabulary. DB-level cohort parity is proven by the PR's per-field table; this
// test fails CI if a parser regresses or a stale-key correction is reverted.
//
// Pure functions only (no DB, no env). Run:
//   npx tsx --test src/lib/field-engine/read-source-directory-facet-config.test.ts
// Wired into `npm run test:fields` (→ `ci`).

import test from "node:test";
import assert from "node:assert/strict";

import {
  directoryFacetConfigFromAConfig,
  directoryFacetConfigFromBConfig,
} from "@/lib/field-engine/read-source-directory-facet-config";

// ── A-side config snapshots (legacy `field_definitions.config`, prod 2026-06-11)
// Scalar facets carry their vocab in config.options[].value (slugs); height +
// years carry min/max; gender carries an explicit filter_options label list.
const A_BODY_TYPE = {
  options: [
    { value: "slim" },
    { value: "athletic" },
    { value: "curvy" },
    { value: "muscular" },
    { value: "average" },
    { value: "other" },
  ],
};
const A_HEIGHT = { min: 80, max: 230 };
const A_GENDER = {
  filter_options: [
    "Woman",
    "Man",
    "Non-binary",
    "Trans woman",
    "Trans man",
    "Transgender",
    "Genderfluid",
    "Genderqueer",
    "Agender",
    "Bigender",
    "Two-Spirit",
    "Intersex",
    "Prefer to self-describe",
    "Prefer not to say",
  ],
};
const A_AVAILABILITY = {
  options: [
    { value: "available_now" },
    { value: "available_this_week" },
    { value: "available_this_month" },
    { value: "limited" },
    { value: "by_request" },
    { value: "unavailable" },
  ],
};
const A_TRAVEL_SCOPE = {
  options: [
    { value: "local" },
    { value: "region" },
    { value: "national" },
    { value: "international" },
  ],
};

// ── B-side config snapshots (what the T3.1 migration WROTE; verified above).
const B_BODY_TYPE = {
  filter_options: ["slim", "athletic", "curvy", "muscular", "average", "other"],
};
const B_HEIGHT = { min: 80, max: 230 };
const B_GENDER = { filter_options: A_GENDER.filter_options };
const B_AVAILABILITY = {
  filter_options: [
    "available_now",
    "available_this_week",
    "available_this_month",
    "limited",
    "by_request",
    "unavailable",
  ],
};
const B_TRAVEL_SCOPE = {
  filter_options: ["local", "region", "national", "international"],
};

test("A parser reads scalar vocab from config.options[].value", () => {
  assert.deepEqual(directoryFacetConfigFromAConfig(A_BODY_TYPE).filterOptions, [
    "slim",
    "athletic",
    "curvy",
    "muscular",
    "average",
    "other",
  ]);
});

test("A parser reads slider bounds + gender label vocab", () => {
  const h = directoryFacetConfigFromAConfig(A_HEIGHT);
  assert.equal(h.min, 80);
  assert.equal(h.max, 230);
  assert.equal(h.filterOptions, null);
  assert.deepEqual(
    directoryFacetConfigFromAConfig(A_GENDER).filterOptions,
    A_GENDER.filter_options,
  );
});

test("B parser reads filter_options + bounds from directory_filter_config", () => {
  assert.deepEqual(
    directoryFacetConfigFromBConfig(B_BODY_TYPE).filterOptions,
    B_BODY_TYPE.filter_options,
  );
  const h = directoryFacetConfigFromBConfig(B_HEIGHT);
  assert.equal(h.min, 80);
  assert.equal(h.max, 230);
  assert.equal(h.filterOptions, null);
});

test("PARITY: non-stale facet vocab is byte-identical A vs B", () => {
  // The migration pinned B.filter_options to A's option SLUGS, so the vocab the
  // directory filters by is identical end to end.
  assert.deepEqual(
    directoryFacetConfigFromBConfig(B_BODY_TYPE).filterOptions,
    directoryFacetConfigFromAConfig(A_BODY_TYPE).filterOptions,
  );
  assert.deepEqual(
    directoryFacetConfigFromBConfig(B_GENDER).filterOptions,
    directoryFacetConfigFromAConfig(A_GENDER).filterOptions,
  );
  const ha = directoryFacetConfigFromAConfig(A_HEIGHT);
  const hb = directoryFacetConfigFromBConfig(B_HEIGHT);
  assert.equal(hb.min, ha.min);
  assert.equal(hb.max, ha.max);
});

test("STALE KEYS: B vocab matches A's option SLUGS (== real stored vocab)", () => {
  // availability.status — A slugs == the stored value distribution; B was
  // corrected away from the junk EDIT options (active/paused/not_available).
  assert.deepEqual(
    directoryFacetConfigFromBConfig(B_AVAILABILITY).filterOptions,
    directoryFacetConfigFromAConfig(A_AVAILABILITY).filterOptions,
  );
  // travel.scope — stored value is "region", NOT the junk "regional"; B uses
  // "region" so the facet chip matches the value store.
  const scope = directoryFacetConfigFromBConfig(B_TRAVEL_SCOPE).filterOptions;
  assert.deepEqual(scope, ["local", "region", "national", "international"]);
  assert.ok(scope?.includes("region"), "uses the real stored slug 'region'");
  assert.ok(!scope?.includes("regional"), "drops the junk edit-vocab 'regional'");
});

test("empty / null config yields an all-null slice (no spurious vocab)", () => {
  const a = directoryFacetConfigFromAConfig(null);
  assert.deepEqual(a, { filterOptions: null, min: null, max: null });
  const b = directoryFacetConfigFromBConfig(undefined);
  assert.deepEqual(b, { filterOptions: null, min: null, max: null });
  // empty filter_options array is treated as "no vocab", not [].
  assert.equal(directoryFacetConfigFromBConfig({ filter_options: [] }).filterOptions, null);
});
