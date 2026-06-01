import assert from "node:assert/strict";
import test from "node:test";

import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNodeKind } from "./types";
import {
  elementLibrarySearchExtraTerms,
  filterKindsForOwnerOnlyAccess,
  filterKindsForShippedElementCatalog,
  isOwnerOnlyElementKind,
  MVP_ELEMENT_LIBRARY_KINDS,
  OWNER_ONLY_ELEMENT_INSERT_KINDS,
  SHIPPED_ELEMENT_INSERT_KINDS,
  sortKindsForElementLibraryCatalog,
} from "./mvp-allow-list";

test("every MVP library kind is registered with leaf or structural contract", () => {
  for (const kind of MVP_ELEMENT_LIBRARY_KINDS) {
    assert.ok(BUILDER_NODE_REGISTRY[kind], `missing registry entry for ${kind}`);
  }
});

test("shipped insert catalog includes every registered builder node kind", () => {
  const shipped = new Set(SHIPPED_ELEMENT_INSERT_KINDS);
  for (const kind of Object.keys(BUILDER_NODE_REGISTRY) as BuilderNodeKind[]) {
    assert.ok(
      shipped.has(kind),
      `add ${kind} to SHIPPED_ELEMENT_INSERT_KINDS when exposing it in the insert library`,
    );
  }
});

test("filterKindsForShippedElementCatalog keeps only shipped kinds", () => {
  assert.deepEqual(
    filterKindsForShippedElementCatalog(["heading", "carousel"] as const),
    ["heading", "carousel"],
  );
});

test("elementLibrarySearchExtraTerms adds intent keywords per kind", () => {
  assert.ok(elementLibrarySearchExtraTerms("card").includes("panel"));
  assert.ok(elementLibrarySearchExtraTerms("cta_group").includes("conversion"));
  assert.ok(elementLibrarySearchExtraTerms("button").includes("cta"));
});

test("code is owner-only: shipped + registered, but never a default MVP element", () => {
  // Registered + shipped (so existing owner-authored blocks load, validate, publish).
  assert.ok(SHIPPED_ELEMENT_INSERT_KINDS.includes("code"), "code is a shipped kind");
  // But deliberately NOT a standard MVP element — ordinary editors never see it.
  assert.ok(
    !MVP_ELEMENT_LIBRARY_KINDS.includes("code"),
    "code stays off the default element library",
  );
  assert.ok(OWNER_ONLY_ELEMENT_INSERT_KINDS.includes("code"), "code is owner-only");
  assert.ok(isOwnerOnlyElementKind("code"), "code flagged owner-only");
  assert.ok(!isOwnerOnlyElementKind("paragraph"), "paragraph is not owner-only");
});

test("filterKindsForOwnerOnlyAccess default-denies owner-only kinds to non-owners", () => {
  const kinds = ["paragraph", "code", "image"] as const;
  // Non-owner (or unspecified) → code stripped.
  assert.deepEqual(filterKindsForOwnerOnlyAccess(kinds, false), ["paragraph", "image"]);
  // Platform owner → code retained.
  assert.deepEqual(filterKindsForOwnerOnlyAccess(kinds, true), ["paragraph", "code", "image"]);
});

test("sortKindsForElementLibraryCatalog orders by category then MVP index", () => {
  const mixed = sortKindsForElementLibraryCatalog([
    "heading",
    "container",
    "paragraph",
    "split",
  ]);
  assert.deepEqual(mixed, ["container", "split", "heading", "paragraph"]);
});
