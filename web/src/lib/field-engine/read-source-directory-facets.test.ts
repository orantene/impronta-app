// read-source-directory-facets.test.ts
//
// T2.1 — unit test for the directory-facet VOCAB BRIDGE (the crux of the A→B
// value-store repoint). System A `field_values` stores option SLUGS; System B
// `talent_profile_field_values` stores a MIX of canonical option LABELS and
// slug-residue. `directoryFacetSlugToBMatchSet` translates an incoming A slug
// into the NORMALIZED candidate set that should match in B. This test pins that
// translation so a regression (e.g. dropping the raw-slug fallback, which would
// silently shrink directory result sets) fails CI.
//
// Pure functions only (no DB). DB-level result-set parity is proven by the
// harness + the per-facet-option table in the PR. Run:
//   npx tsx --test src/lib/field-engine/read-source-directory-facets.test.ts
// Wired into `npm run test:fields` (→ `ci`).

import test from "node:test";
import assert from "node:assert/strict";

import {
  directoryFacetSlugToBMatchSet,
  normalizeFacetValue,
} from "@/lib/field-engine/read-source-directory-facets";

// Real B option-label lists captured read-only from prod (2026-06-11).
const B_BODY_TYPE = ["Slim", "Athletic", "Curvy", "Plus", "Muscular", "Other"];
const B_HAIR_COLOR = [
  "Black",
  "Dark brown",
  "Brown",
  "Light brown",
  "Blonde",
  "Red",
  "Auburn",
  "Grey",
  "White",
  "Other",
];
const B_DRESS_SIZE = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
// availability.status / travel.scope: B's catalog labels DIVERGE from the stored
// slugs (the mirror copied slugs through), so the bridge must fall back to the
// raw slug for these.
const B_AVAILABILITY = ["active", "by_request", "paused", "not_available"];

test("normalizeFacetValue collapses slug/label/case drift to one form", () => {
  assert.equal(normalizeFacetValue("Dark brown"), "dark brown");
  assert.equal(normalizeFacetValue("dark_brown"), "dark brown");
  assert.equal(normalizeFacetValue("dark-brown"), "dark brown");
  assert.equal(normalizeFacetValue("  Athletic  "), "athletic");
  assert.equal(normalizeFacetValue("available_now"), "available now");
});

test("slug that maps to a B label → matches BOTH the label and the slug (normalized)", () => {
  // "athletic" (A slug) → "Athletic" (B label). B may store either form.
  const set = directoryFacetSlugToBMatchSet("athletic", B_BODY_TYPE);
  assert.ok(set.includes("athletic"), "keeps the raw slug (catches slug-residue rows)");
  // label normalizes to the same token, so the set is a single normalized entry
  assert.deepEqual(set, ["athletic"]);
});

test("multi-word slug ⇄ multi-word label both normalize into the match set", () => {
  // "dark_brown" (A) → "Dark brown" (B label) → both normalize to "dark brown".
  const set = directoryFacetSlugToBMatchSet("dark_brown", B_HAIR_COLOR);
  assert.deepEqual(set, ["dark brown"]);
});

test("case-only slug (dress size) resolves to its upper-case B label", () => {
  // "xs" (A slug) → "XS" (B label); both normalize to "xs".
  assert.deepEqual(directoryFacetSlugToBMatchSet("xs", B_DRESS_SIZE), ["xs"]);
  assert.deepEqual(directoryFacetSlugToBMatchSet("xxl", B_DRESS_SIZE), ["xxl"]);
});

test("ORPHAN slug with no B-label match still yields its own normalized form (never vanishes)", () => {
  // body_type "average" has no B option — but B stores the value "average"
  // verbatim, so matching its own normalized form is correct + non-empty.
  assert.deepEqual(directoryFacetSlugToBMatchSet("average", B_BODY_TYPE), ["average"]);
  // hair_color "gray" — B label is "Grey" (slug "grey" ≠ "gray"); matchLabelOption
  // does NOT bridge gray↔grey, so the set is just the raw slug. B stores "gray"
  // verbatim for these talents → still matches.
  assert.deepEqual(directoryFacetSlugToBMatchSet("gray", B_HAIR_COLOR), ["gray"]);
});

test("divergent-vocab key (availability) falls back to the raw slug", () => {
  // A slug "available_now" has NO match among B's labels (active/by_request/…),
  // so the candidate set is exactly the normalized raw slug — which is what B
  // actually stores for these rows (mirror copied the slug through).
  assert.deepEqual(directoryFacetSlugToBMatchSet("available_now", B_AVAILABILITY), [
    "available now",
  ]);
  // "by_request" happens to exist in BOTH the slug set and B's labels → still one
  // normalized entry, no duplication.
  assert.deepEqual(directoryFacetSlugToBMatchSet("by_request", B_AVAILABILITY), [
    "by request",
  ]);
});

test("empty / whitespace slug yields an empty match set (no spurious match)", () => {
  assert.deepEqual(directoryFacetSlugToBMatchSet("", B_BODY_TYPE), []);
  assert.deepEqual(directoryFacetSlugToBMatchSet("   ", B_BODY_TYPE), []);
});
