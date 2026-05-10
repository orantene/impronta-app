import assert from "node:assert/strict";
import test from "node:test";

import {
  findBuilderNodeById,
  resolveStandaloneBuilderNodeForContent,
  treeContainsBuilderNodeId,
} from "./builder-node-content-utils";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";

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
