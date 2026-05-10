import assert from "node:assert/strict";
import test from "node:test";

import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNodeKind } from "./types";
import {
  elementLibrarySearchExtraTerms,
  filterKindsForShippedElementCatalog,
  MVP_ELEMENT_LIBRARY_KINDS,
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

test("elementLibrarySearchExtraTerms includes roadmap alias keywords", () => {
  assert.ok(elementLibrarySearchExtraTerms("container").includes("card"));
  assert.ok(elementLibrarySearchExtraTerms("button").includes("cta"));
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
