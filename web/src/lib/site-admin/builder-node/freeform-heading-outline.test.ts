import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHeadingOutlineFromBuilderTree,
  lintBuilderTreeA11y,
} from "./freeform-heading-outline";
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

test("lintBuilderTreeA11y flags a skipped heading level (h1 -> h3)", () => {
  const tree: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "h1", kind: "heading", props: { text: "Main title", level: 1 } },
        { id: "h3", kind: "heading", props: { text: "Buried", level: 3 } },
      ],
    },
  ];

  const report = lintBuilderTreeA11y(tree);
  assert.equal(report.missingAlt.length, 0);
  const skipped = report.headingIssues.find((i) => i.kind === "skipped_level");
  assert.ok(skipped, "expected a skipped_level heading issue");
  assert.equal(skipped?.heading?.level, 3);
});

test("lintBuilderTreeA11y flags multiple H1s on the freeform tree", () => {
  const tree: BuilderNodeTree = [
    { id: "a", kind: "heading", props: { text: "First", level: 1 } },
    { id: "b", kind: "heading", props: { text: "Second", level: 1 } },
  ];

  const report = lintBuilderTreeA11y(tree);
  assert.ok(
    report.headingIssues.some((i) => i.kind === "multiple_h1"),
    "expected a multiple_h1 heading issue",
  );
});

test("lintBuilderTreeA11y flags an image with empty/absent alt (deep in a subtree)", () => {
  const tree: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "h1", kind: "heading", props: { text: "Gallery", level: 1 } },
        {
          id: "card",
          kind: "card",
          props: {},
          children: [
            // missing alt entirely
            { id: "img-no-alt", kind: "image", props: { src: "https://x/1.jpg" } },
            // empty alt string
            {
              id: "img-empty-alt",
              kind: "image",
              props: { src: "https://x/2.jpg", alt: "   " },
            },
            // good alt — must NOT be flagged
            {
              id: "img-ok",
              kind: "image",
              props: { src: "https://x/3.jpg", alt: "A portrait of the chef" },
            },
            // no src — not a screen-reader problem yet, not flagged
            { id: "img-empty", kind: "image", props: { src: "" } },
            // alt bound to a dynamic field — resolved at render, not flagged
            {
              id: "img-bound",
              kind: "image",
              props: {
                src: "https://x/4.jpg",
                fieldBindings: { alt: "talent.headshotAlt" },
              },
            },
          ],
        },
      ],
    },
  ];

  const report = lintBuilderTreeA11y(tree);
  const flaggedIds = report.missingAlt.map((f) => f.nodeId).sort();
  assert.deepEqual(flaggedIds, ["img-empty-alt", "img-no-alt"]);
  assert.equal(report.missingAlt[0]?.severity, "warn");
});

test("lintBuilderTreeA11y uses the image layer label when present", () => {
  const tree: BuilderNodeTree = [
    {
      id: "img",
      kind: "image",
      props: { src: "https://x/hero.jpg", layerLabel: "Hero banner" },
    },
  ];

  const report = lintBuilderTreeA11y(tree);
  assert.equal(report.missingAlt.length, 1);
  assert.equal(report.missingAlt[0]?.label, "Hero banner");
});

test("lintBuilderTreeA11y returns no findings for a clean, well-structured tree", () => {
  const tree: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "h1", kind: "heading", props: { text: "Welcome", level: 1 } },
        { id: "h2", kind: "heading", props: { text: "About", level: 2 } },
        {
          id: "img-ok",
          kind: "image",
          props: { src: "https://x/photo.jpg", alt: "A welcoming storefront" },
        },
      ],
    },
  ];

  const report = lintBuilderTreeA11y(tree);
  assert.equal(report.headingIssues.length, 0);
  assert.equal(report.missingAlt.length, 0);
});
