import assert from "node:assert/strict";
import { test } from "node:test";

import {
  builderNodeRowMatchesSearch,
  filterFreeformRowsWithAncestors,
  sectionLayerMatchesSearch,
} from "./navigator-layer-search";

test("layer search matches Spanish servicios against services type key", () => {
  assert.equal(
    builderNodeRowMatchesSearch(
      {
        id: "1",
        label: "Stack",
        kind: "container",
        sectionTypeKey: "services_list",
      },
      "servicios",
    ),
    true,
  );
  assert.equal(
    sectionLayerMatchesSearch({
      cleanedName: "Services",
      displayName: "Nuestros servicios",
      sectionTypeKey: "services",
      query: "servicios",
    }),
    true,
  );
});

test("layer search matches accent-folded galeria against gallery types", () => {
  assert.equal(
    builderNodeRowMatchesSearch(
      {
        id: "g",
        label: "Stack",
        kind: "container",
        sectionTypeKey: "gallery_strip",
      },
      "galería",
    ),
    true,
  );
  assert.equal(
    builderNodeRowMatchesSearch(
      {
        id: "g2",
        label: "Stack",
        kind: "section_embed",
        sectionTypeKey: "gallery",
      },
      "galeria",
    ),
    true,
  );
});

test("filter keeps ancestors of Spanish alias matches", () => {
  const rows = [
    {
      id: "root",
      depth: 0,
      label: "Page",
      kind: "container" as const,
      sectionTypeKey: null,
    },
    {
      id: "svc",
      depth: 1,
      label: "Stack",
      kind: "container" as const,
      sectionTypeKey: "services_catalog",
    },
  ];
  const filtered = filterFreeformRowsWithAncestors(rows, "servicios");
  assert.deepEqual(
    filtered.map((r) => r.id),
    ["root", "svc"],
  );
});

test("empty query keeps every freeform row", () => {
  const rows = [
    {
      id: "a",
      depth: 0,
      label: "Hero",
      kind: "section_embed" as const,
      sectionTypeKey: "hero",
    },
  ];
  assert.equal(filterFreeformRowsWithAncestors(rows, "  ").length, 1);
});

test("layer search matches galeria against English Gallery Grid layerLabel", () => {
  assert.equal(
    builderNodeRowMatchesSearch(
      {
        id: "gg",
        label: "Gallery Grid",
        kind: "container",
        sectionTypeKey: null,
      },
      "galeria",
    ),
    true,
  );
});
