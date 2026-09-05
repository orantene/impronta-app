import test from "node:test";
import assert from "node:assert/strict";

import {
  issueNodePath,
  resolveSnapshotBuilderTree,
  resolveSnapshotBuilderTreeForPublish,
  salvageBuilderTree,
  type SnapshotWithBuilderTree,
} from "./snapshot-tree";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderBuilderNodes } from "./render";
import type { BuilderNodeTree } from "./types";

// Regression for the agency-homepage edit-mode crash:
// "Cannot read properties of undefined (reading 'some')". An edit-mode draft
// snapshot is built from a pure builderTree and can arrive with `slots`
// undefined even though HomepageSnapshot types it required. The resolver and the
// publish path must normalize it to [] instead of throwing on `slots.some(...)`.

const validTree: BuilderNodeTree = [
  {
    id: "section-1",
    kind: "section",
    props: { sectionId: "section-1", sectionTypeKey: "hero" },
    children: [
      { id: "heading-1", kind: "heading", props: { text: "Headline", level: 2 } },
    ],
  },
];

test("resolveSnapshotBuilderTree tolerates undefined slots with a builderTree", () => {
  // slots omitted entirely — the exact runtime shape that crashed.
  const snapshot = { builderTree: validTree } as unknown as SnapshotWithBuilderTree;
  let tree: BuilderNodeTree | undefined;
  assert.doesNotThrow(() => {
    tree = resolveSnapshotBuilderTree(snapshot).tree;
  });
  assert.ok(Array.isArray(tree));
});

test("resolveSnapshotBuilderTree tolerates undefined slots with no builderTree", () => {
  const snapshot = {} as unknown as SnapshotWithBuilderTree;
  assert.doesNotThrow(() => resolveSnapshotBuilderTree(snapshot));
});

test("resolveSnapshotBuilderTreeForPublish tolerates undefined slots", () => {
  const snapshot = { builderTree: validTree } as unknown as SnapshotWithBuilderTree;
  assert.doesNotThrow(() => resolveSnapshotBuilderTreeForPublish(snapshot));
});

// ── One invalid node must not blank the page ────────────────────────────────
// Three blank El Paisa pages on 2026-09-05 shared one mechanism: a single bad
// node, the whole tree refused here, `slots: []` served nothing. A validator
// that refuses is right; a fallback that answers with nothing is not.

const pageWithOneBadNode: BuilderNodeTree = [
  {
    id: "root",
    kind: "container",
    props: { layout: "stack" },
    children: [
      { id: "h1", kind: "heading", props: { text: "El Paisa", level: 1 } },
      { id: "empty", kind: "paragraph", props: { text: "" } }, // invalid: min(1)
      { id: "keep", kind: "paragraph", props: { text: "Order from the menu below." } },
      { id: "btn", kind: "button", props: { label: "Browse the menu", href: "#menu" } },
    ],
  },
] as unknown as BuilderNodeTree;

test("issueNodePath reads the validator's path into child indices", () => {
  assert.deepEqual(issueNodePath("root.0.children.2.children.0.props.text"), [0, 2, 0]);
  assert.deepEqual(issueNodePath("root.3.props"), [3]);
  assert.equal(issueNodePath("root"), null);
});

test("a tree with ONE invalid node is served without that node, never as an empty slot list", () => {
  const res = resolveSnapshotBuilderTree({ builderTree: pageWithOneBadNode, slots: [] });
  assert.equal(res.source, "snapshot_builder_tree", `fell to ${res.source}`);
  assert.equal(res.salvaged, true);
  assert.ok(res.issues.length > 0, "the failure must still be reported");
  const ids = (res.tree[0] as { children: Array<{ id: string }> }).children.map((c) => c.id);
  assert.deepEqual(ids, ["h1", "keep", "btn"]);
  const html = renderToStaticMarkup(createElement("main", null, renderBuilderNodes(res.tree, { mode: "freeform" })));
  assert.match(html, /El Paisa/);
  assert.match(html, /Browse the menu/);
});

test("a nested invalid node is dropped alone; its valid siblings and ancestors stay", () => {
  const tree = [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "hero",
          kind: "container",
          props: { layout: "stack" },
          children: [
            { id: "eyebrow", kind: "paragraph", props: { text: "" } },
            { id: "h1", kind: "heading", props: { text: "El Paisa", level: 1 } },
            { id: "sub", kind: "paragraph", props: { text: "" } },
          ],
        },
        { id: "menu", kind: "menu_board", props: {} },
      ],
    },
  ] as unknown as BuilderNodeTree;
  const res = resolveSnapshotBuilderTree({ builderTree: tree, slots: [] });
  assert.equal(res.source, "snapshot_builder_tree");
  const root = res.tree[0] as { children: Array<{ id: string; children?: Array<{ id: string }> }> };
  assert.deepEqual(root.children.map((c) => c.id), ["hero", "menu"]);
  assert.deepEqual(root.children[0].children?.map((c) => c.id), ["h1"]);
});

test("salvage reports what it dropped, by path", () => {
  const first = resolveSnapshotBuilderTree({ builderTree: pageWithOneBadNode, slots: [] });
  const out = salvageBuilderTree(pageWithOneBadNode, first.issues);
  assert.ok(out);
  assert.deepEqual(out.dropped, ["root.0.children.1"]);
});

test("when nothing can be salvaged the legacy-slot fallback still applies, as before", () => {
  const res = resolveSnapshotBuilderTree({ builderTree: "not a tree", slots: [] });
  assert.equal(res.source, "legacy_slots");
  assert.equal(res.salvaged, undefined);
  const allBad = [{ id: "x", kind: "paragraph", props: { text: "" } }] as unknown as BuilderNodeTree;
  const res2 = resolveSnapshotBuilderTree({ builderTree: allBad, slots: [] });
  assert.equal(res2.source, "legacy_slots", "a tree whose only node is invalid has nothing left to serve");
});

