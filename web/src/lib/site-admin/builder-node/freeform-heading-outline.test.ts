import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHeadingOutlineFromBuilderTree,
  lintBuilderTreeA11y,
} from "./freeform-heading-outline";
import type { ComponentDefinitions } from "./component-instances";
import type { BuilderNode, BuilderNodeTree } from "./types";

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

// ── A11Y-3 — living-component instances (resolved-at-render subtrees) ─────────

/**
 * A master component whose CURRENT subtree has a heading + an image with NO alt.
 * The instance's STORED snapshot is STALE — it still carries an old alt the
 * master has since lost, plus the master heading text. So the stored-children
 * walk lints clean while the LIVE render (current master) is genuinely broken:
 * exactly the under-report A11Y-3 fixes. A per-instance override also rewrites
 * the heading text, which the live outline must reflect.
 */
function instanceFixture(): {
  tree: BuilderNodeTree;
  components: ComponentDefinitions;
} {
  // CURRENT master — the image has lost its alt.
  const master: BuilderNode = {
    id: "cmp-card",
    kind: "container",
    props: { layout: "stack" },
    children: [
      { id: "m-heading", kind: "heading", props: { text: "Master heading", level: 2 } },
      { id: "m-image", kind: "image", props: { src: "https://x/master.jpg" } },
    ],
  };
  const components: ComponentDefinitions = { "cmp-card": master };

  // STORED snapshot the instance was last synced from — image still has alt.
  const staleSnapshot: BuilderNode[] = [
    { id: "m-heading", kind: "heading", props: { text: "Master heading", level: 2 } },
    {
      id: "m-image",
      kind: "image",
      props: { src: "https://x/master.jpg", alt: "Stale alt from an old sync" },
    },
  ];

  const tree: BuilderNodeTree = [
    { id: "page-h1", kind: "heading", props: { text: "Page title", level: 1 } },
    {
      id: "inst-1",
      kind: "container",
      props: {
        layout: "stack",
        instanceOf: "cmp-card",
        // Override rewrites the heading text (no alt override).
        instanceOverrides: { "m-heading": { text: "Overridden heading" } },
      },
      children: staleSnapshot,
    },
  ];
  return { tree, components };
}

test("A11Y-3: without components, the instance is walked via its STALE stored children (old alt present → not flagged)", () => {
  const { tree } = instanceFixture();
  const report = lintBuilderTreeA11y(tree);
  // Backward-compat: stale snapshot has alt, so the missing-alt walk is clean
  // (this is precisely the under-report — the live page IS broken).
  assert.equal(report.missingAlt.length, 0);
  // Stored heading text feeds the outline.
  const outline = buildHeadingOutlineFromBuilderTree(tree);
  assert.deepEqual(outline.map((n) => n.text), ["Page title", "Master heading"]);
});

test("A11Y-3: with components, the LIVE-resolved instance image (current master lost its alt) IS flagged", () => {
  const { tree, components } = instanceFixture();
  const report = lintBuilderTreeA11y(tree, components);
  // The resolved instance image reflects the CURRENT master (no alt) → flagged.
  // Its node id is namespaced by the instance id (`<instanceId>__<masterId>`).
  assert.equal(report.missingAlt.length, 1);
  assert.equal(report.missingAlt[0]?.nodeId, "inst-1__m-image");
  // And the overridden heading text is what lands in the outline, not the master.
  const outline = buildHeadingOutlineFromBuilderTree(tree, components);
  assert.deepEqual(outline.map((n) => n.text), ["Page title", "Overridden heading"]);
});

test("A11Y-3: with components, an override that ADDS alt to a master image lacking one is NOT over-reported", () => {
  const master: BuilderNode = {
    id: "cmp-bare",
    kind: "container",
    props: { layout: "stack" },
    children: [
      // Master image has NO alt — a stored-children walk would flag it.
      { id: "m-img", kind: "image", props: { src: "https://x/bare.jpg" } },
    ],
  };
  const components: ComponentDefinitions = { "cmp-bare": master };
  const tree: BuilderNodeTree = [
    {
      id: "inst",
      kind: "container",
      props: {
        layout: "stack",
        instanceOf: "cmp-bare",
        // The instance supplies the alt the master lacked.
        instanceOverrides: { "m-img": { imageAlt: "Resolved alt" } },
      },
      children: master.children.map((c) => ({ ...c })),
    },
  ];

  // Stored-children walk (no components) WOULD flag the bare master image…
  assert.equal(lintBuilderTreeA11y(tree).missingAlt.length, 1);
  // …but the resolved instance has the override alt → no finding.
  assert.equal(lintBuilderTreeA11y(tree, components).missingAlt.length, 0);
});

test("A11Y-3: a tagged instance with NO available definition falls back to stored children (no crash)", () => {
  const tree: BuilderNodeTree = [
    {
      id: "inst-orphan",
      kind: "container",
      props: { layout: "stack", instanceOf: "missing-cmp" },
      children: [
        { id: "img-no-alt", kind: "image", props: { src: "https://x/o.jpg" } },
      ],
    },
  ];
  // Components map provided but the definition is absent → resolveInstanceChildren
  // returns null → graceful fallback to stored children (which IS flagged).
  const report = lintBuilderTreeA11y(tree, {
    other: { id: "other", kind: "spacer", props: { size: "m" } },
  });
  assert.equal(report.missingAlt.length, 1);
  assert.equal(report.missingAlt[0]?.nodeId, "img-no-alt");
});
