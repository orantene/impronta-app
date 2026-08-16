import assert from "node:assert/strict";
import test from "node:test";

import {
  findBuilderNodeById,
  removeItemAt,
  resolveClearableMediaSrc,
  resolveHonestSelectedBuilderNodeId,
  resolveStandaloneBuilderNodeForContent,
  treeContainsBuilderNodeId,
} from "./builder-node-content-utils";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import { renderToStaticMarkup } from "react-dom/server";

function makeTree(): BuilderNodeTree {
  return [
    {
      id: "section-1",
      kind: "section",
      props: {
        sectionId: "11111111-1111-1111-1111-111111111111",
        sectionTypeKey: "hero",
      },
      children: [
        {
          id: "builder-heading-freeform",
          kind: "heading",
          props: {
            text: "Standalone heading",
            level: 2,
          },
        },
        {
          id: "legacy:body:0:hero:heading:headline",
          kind: "heading",
          props: {
            text: "Role-bound headline",
            level: 2,
          },
        },
        {
          id: "builder-accordion-root",
          kind: "accordion",
          props: {
            allowMultiple: true,
          },
          children: [
            {
              id: "builder-accordion-item",
              kind: "accordion_item",
              props: {
                title: "FAQ item",
              },
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

test("findBuilderNodeById resolves nested builder nodes", () => {
  const tree = makeTree();
  const node = findBuilderNodeById(tree, "builder-accordion-item");
  assert.ok(node);
  assert.equal(node.kind, "accordion_item");
});

test("resolveStandaloneBuilderNodeForContent returns freeform selected nodes", () => {
  const tree = makeTree();
  const node = resolveStandaloneBuilderNodeForContent(
    tree,
    "builder-heading-freeform",
  );
  assert.ok(node);
  assert.equal(node.kind, "heading");
});

test("resolveStandaloneBuilderNodeForContent ignores role-bound legacy nodes", () => {
  const tree = makeTree();
  const node = resolveStandaloneBuilderNodeForContent(
    tree,
    "legacy:body:0:hero:heading:headline",
  );
  assert.equal(node, null);
});

test("resolveStandaloneBuilderNodeForContent ignores section roots", () => {
  const tree = makeTree();
  const node = resolveStandaloneBuilderNodeForContent(tree, "section-1");
  assert.equal(node, null);
});

test("treeContainsBuilderNodeId matches findBuilderNodeById presence", () => {
  const tree = makeTree();
  assert.equal(treeContainsBuilderNodeId(tree, "builder-heading-freeform"), true);
  assert.equal(treeContainsBuilderNodeId(tree, "missing-id"), false);
});

test("resolveHonestSelectedBuilderNodeId returns null without a section", () => {
  const tree = makeTree();
  assert.equal(
    resolveHonestSelectedBuilderNodeId({
      selectedSectionId: null,
      selectedBuilderNodeIdOverride: "builder-heading-freeform",
      builderTree: tree,
      sectionIdByBuilderNodeId: new Map([
        ["builder-heading-freeform", "11111111-1111-1111-1111-111111111111"],
      ]),
      builderNodeIdBySectionId: new Map([
        ["11111111-1111-1111-1111-111111111111", "builder-heading-freeform"],
      ]),
    }),
    null,
  );
});

test("resolveHonestSelectedBuilderNodeId accepts override when in tree and section matches", () => {
  const tree = makeTree();
  const sectionId = "11111111-1111-1111-1111-111111111111";
  assert.equal(
    resolveHonestSelectedBuilderNodeId({
      selectedSectionId: sectionId,
      selectedBuilderNodeIdOverride: "builder-heading-freeform",
      builderTree: tree,
      sectionIdByBuilderNodeId: new Map([["builder-heading-freeform", sectionId]]),
      builderNodeIdBySectionId: new Map([[sectionId, "legacy:body:0:hero:heading:headline"]]),
    }),
    "builder-heading-freeform",
  );
});

test("resolveHonestSelectedBuilderNodeId ignores override missing from tree", () => {
  const tree = makeTree();
  const sectionId = "11111111-1111-1111-1111-111111111111";
  assert.equal(
    resolveHonestSelectedBuilderNodeId({
      selectedSectionId: sectionId,
      selectedBuilderNodeIdOverride: "ghost-not-in-tree",
      builderTree: tree,
      sectionIdByBuilderNodeId: new Map([["ghost-not-in-tree", sectionId]]),
      builderNodeIdBySectionId: new Map([[sectionId, "builder-heading-freeform"]]),
    }),
    "builder-heading-freeform",
  );
});

test("resolveHonestSelectedBuilderNodeId ignores override owned by another section", () => {
  const tree = makeTree();
  const sectionId = "11111111-1111-1111-1111-111111111111";
  const otherSection = "22222222-2222-2222-2222-222222222222";
  assert.equal(
    resolveHonestSelectedBuilderNodeId({
      selectedSectionId: sectionId,
      selectedBuilderNodeIdOverride: "builder-heading-freeform",
      builderTree: tree,
      sectionIdByBuilderNodeId: new Map([["builder-heading-freeform", otherSection]]),
      builderNodeIdBySectionId: new Map([[sectionId, "legacy:body:0:hero:heading:headline"]]),
    }),
    "legacy:body:0:hero:heading:headline",
  );
});

// ── D3 regression: MediaPickerButton Clear on required-`src` media fields ──
//
// The image/video node inspectors used to guard their MediaPickerButton
// `onChange` with `if (!next) return;`, which silently swallowed the
// `next === null` Clear signal (and, for `variant="row"`, Clear wasn't even
// rendered — fixed separately in media-picker-button.tsx). These tests lock
// in the fixed behavior: `resolveClearableMediaSrc` turns a Clear into a
// real, empty `src` the schema and renderer both treat as "no media set"
// rather than a no-op.

test("resolveClearableMediaSrc: Clear (null) resolves to empty string, not a no-op", () => {
  assert.equal(resolveClearableMediaSrc(null), "");
});

test("resolveClearableMediaSrc: a picked/pasted URL passes through unchanged", () => {
  assert.equal(
    resolveClearableMediaSrc("https://example.com/photo.jpg"),
    "https://example.com/photo.jpg",
  );
});

test("D3: an image node cleared to an empty src renders nothing (not a crash, not the old image)", () => {
  const html = renderToStaticMarkup(
    renderBuilderNodes(
      [
        {
          id: "img1",
          kind: "image",
          props: { src: resolveClearableMediaSrc(null), alt: "" },
        },
      ],
      { mode: "freeform" },
    ) as Parameters<typeof renderToStaticMarkup>[0],
  );
  assert.ok(!html.includes("<img"), "cleared image node renders no <img>");
});

test("removeItemAt: social_feed Clear on a required mediaUrl removes that post (mirrors the Remove button)", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(removeItemAt(items, 1), [{ id: "a" }, { id: "c" }]);
  // Original array is untouched (patchItem-style callers always replace
  // the whole `items` prop, never mutate in place).
  assert.deepEqual(items, [{ id: "a" }, { id: "b" }, { id: "c" }]);
});
