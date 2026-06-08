import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHeadingOutlineFromBuilderTree } from "./freeform-heading-outline";
import type { BuilderNodeTree } from "./types";

test("buildHeadingOutlineFromBuilderTree collects section_embed and heading blocks in order", () => {
  const tree: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "embed-hero-search",
          kind: "section_embed",
          props: {
            sectionTypeKey: "hero_search",
            config: { headline: "Find the right talent" },
          },
        },
        {
          id: "h1-classic",
          kind: "heading",
          props: { text: "Discover premium talent", level: 1 },
        },
        {
          id: "embed-grid",
          kind: "section_embed",
          props: {
            sectionTypeKey: "talent_type_grid",
            config: { headline: "Talent, by discipline" },
          },
        },
      ],
    },
  ];

  const outline = buildHeadingOutlineFromBuilderTree(tree);
  assert.deepEqual(
    outline.map((n) => n.text),
    ["Find the right talent", "Discover premium talent", "Talent, by discipline"],
  );
  assert.equal(outline[0]?.sectionId, "embed-hero-search");
  assert.equal(outline[1]?.level, 1);
});
