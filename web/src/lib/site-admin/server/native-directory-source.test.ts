/**
 * native-directory-source.test.ts — BUILDER 2027 · P2B.
 *
 * The property under test is TENANT ISOLATION, not formatting. A native
 * `directory` node's fallback grid renders whatever the server hands it, and
 * this repo has already shipped an agency page that served a talent it had
 * REMOVED from its roster, with a dead Inquire button, because RLS enforces the
 * GLOBAL listing gate and roster membership is a SEPARATE predicate.
 *
 * `applyNativeDirectoryCardPolicy` is the defence-in-depth half of that gate
 * (the query-layer `listTalentIdsOnTenantRoster` intersection inside
 * `fetchDirectoryPage` is the primary), and it is pure precisely so a test can
 * hand it a foreign row and assert it does not survive.
 *
 * Runner: `tsx --test`, reached by `test:builder` (which expands
 * `src/lib/site-admin/server` recursively).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyNativeDirectoryCardPolicy,
  mapDirectoryDefaultSort,
  projectDirectoryCardForNativeGrid,
} from "./native-directory-source";

function card(profileCode: string) {
  return {
    id: `id-${profileCode}`,
    profileCode,
    slugPart: null,
    displayName: profileCode,
    primaryTalentTypeLabel: "Chef",
    locationLabel: "Tulum",
    isFeatured: false,
    thumbnailUrl: null,
  };
}

const codes = (cards: ReadonlyArray<{ profileCode: string }>) =>
  cards.map((c) => c.profileCode);

test("a card OUTSIDE the tenant roster set never survives the policy", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("MINE-1"), card("THEIRS-1"), card("MINE-2")],
    rosterProfileCodes: new Set(["mine-1", "mine-2"]),
    manualProfileCodes: [],
    pinnedProfileCodes: [],
    excludedProfileCodes: [],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), ["MINE-1", "MINE-2"]);
});

test("an EMPTY roster set yields no cards, not every card", () => {
  // "No roster" must read as "no results", never as "no filter" — the
  // difference between an empty agency page and a cross-tenant leak.
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("A"), card("B")],
    rosterProfileCodes: new Set<string>(),
    manualProfileCodes: [],
    pinnedProfileCodes: [],
    excludedProfileCodes: [],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), []);
});

test("the roster gate is case-insensitive on the profile code", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("Mine-1")],
    rosterProfileCodes: new Set(["mine-1"]),
    manualProfileCodes: [],
    pinnedProfileCodes: [],
    excludedProfileCodes: [],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), ["Mine-1"]);
});

test("a card with no profile code is dropped rather than rendered unlinkable", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [{ ...card("A"), profileCode: "" }, card("B")],
    rosterProfileCodes: null,
    manualProfileCodes: [],
    pinnedProfileCodes: [],
    excludedProfileCodes: [],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), ["B"]);
});

test("excluded codes are removed", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("A"), card("B"), card("C")],
    rosterProfileCodes: null,
    manualProfileCodes: [],
    pinnedProfileCodes: [],
    excludedProfileCodes: ["b"],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), ["A", "C"]);
});

test("manual pick keeps the OPERATOR's order, not the query's", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("A"), card("B"), card("C")],
    rosterProfileCodes: null,
    manualProfileCodes: ["C", "A"],
    pinnedProfileCodes: [],
    excludedProfileCodes: [],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), ["C", "A"]);
});

test("a manual pick naming somebody off the roster silently drops them", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("A")],
    rosterProfileCodes: new Set(["a"]),
    manualProfileCodes: ["A", "REMOVED-1"],
    pinnedProfileCodes: [],
    excludedProfileCodes: [],
    pageSize: 24,
  });
  assert.deepEqual(
    codes(out),
    ["A"],
    "a hand-picked talent the agency later removed must not come back",
  );
});

test("exclusion beats manual pick", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("A"), card("B")],
    rosterProfileCodes: null,
    manualProfileCodes: ["A", "B"],
    pinnedProfileCodes: [],
    excludedProfileCodes: ["A"],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), ["B"]);
});

test("pinned codes come first, in the order they were pinned", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("A"), card("B"), card("C"), card("D")],
    rosterProfileCodes: null,
    manualProfileCodes: [],
    pinnedProfileCodes: ["C", "B"],
    excludedProfileCodes: [],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), ["C", "B", "A", "D"]);
});

test("pinning does not duplicate or drop the unpinned tail", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("A"), card("B"), card("C")],
    rosterProfileCodes: null,
    manualProfileCodes: [],
    pinnedProfileCodes: ["B"],
    excludedProfileCodes: [],
    pageSize: 24,
  });
  assert.deepEqual(codes(out), ["B", "A", "C"]);
});

test("pageSize truncates AFTER pinning, so a pinned card is never cut", () => {
  const out = applyNativeDirectoryCardPolicy({
    cards: [card("A"), card("B"), card("C"), card("D")],
    rosterProfileCodes: null,
    manualProfileCodes: [],
    pinnedProfileCodes: ["D"],
    excludedProfileCodes: [],
    pageSize: 2,
  });
  assert.deepEqual(codes(out), ["D", "A"]);
});

test("the fallback grid seeds in the SAME order the live engine will re-query", () => {
  // A second, subtly different sort mapping here would seed the static grid in
  // one order and the hydrated grid in another; the visible symptom is a card
  // reshuffle the instant the page comes alive.
  assert.equal(mapDirectoryDefaultSort("newest"), "recent");
  assert.equal(mapDirectoryDefaultSort("recommended"), "recommended");
  // `az`, `availability` and `curated` have no engine sort; they must fall back
  // rather than be passed through as a string that fragments the cache key.
  assert.equal(mapDirectoryDefaultSort("az"), "recommended");
  assert.equal(mapDirectoryDefaultSort("availability"), "recommended");
  assert.equal(mapDirectoryDefaultSort("curated"), "recommended");
});

test("the card projection invents nothing the directory payload does not carry", () => {
  const projected = projectDirectoryCardForNativeGrid({
    id: "t1",
    profileCode: "TAL-1",
    slugPart: "ana",
    displayName: "Ana",
    primaryTalentTypeLabel: "Chef",
    locationLabel: "Tulum",
    fitLabels: [],
    cardAttributes: [],
    firstName: "Ana",
    lastName: null,
    createdAt: "2026-01-01",
    isFeatured: true,
    featuredLevel: 1,
    featuredPosition: 0,
    profileCompletenessScore: 50,
    manualRankOverride: null,
    heightCm: null,
    thumbnail: { url: "/a.jpg", width: 10, height: 10 },
  });
  assert.equal(projected.thumbnailUrl, "/a.jpg");
  assert.equal(projected.isFeatured, true);
  assert.equal(
    projected.availabilityLabel,
    null,
    "an availability label the payload never carried must stay null, not a guess",
  );
  assert.deepEqual(projected.languages, []);
  assert.equal(projected.secondaryTalentTypeLabel, null);
});
