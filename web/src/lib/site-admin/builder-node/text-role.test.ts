import assert from "node:assert/strict";
import { test } from "node:test";

import { convertBuilderTextNodeRole } from "./operations";
import {
  buildConvertedTextNode,
  resolveBuilderTextRoleFromNode,
} from "./text-role";
import type { BuilderNodeTree } from "./types";

test("resolveBuilderTextRoleFromNode maps heading levels", () => {
  assert.equal(
    resolveBuilderTextRoleFromNode({
      id: "h",
      kind: "heading",
      props: { text: "Hi", level: 2 },
    }),
    "h2",
  );
});

test("convertBuilderTextNodeRole changes paragraph to heading", () => {
  const tree: BuilderNodeTree = [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "p1",
          kind: "paragraph",
          props: { text: "Lead copy", style: { fontSize: "20px" } },
        },
      ],
    },
  ];
  const result = convertBuilderTextNodeRole({
    tree,
    nodeId: "p1",
    role: "h2",
  });
  assert.equal(result.ok, true);
  if (!result.ok || !("tree" in result)) return;
  const container = result.tree[0]!;
  assert.equal(container.kind, "container");
  if (container.kind !== "container" || !container.children) return;
  const node = container.children[0]!;
  assert.equal(node.kind, "heading");
  if (node.kind === "heading") {
    assert.equal(node.props.level, 2);
    assert.equal(node.props.text, "Lead copy");
    assert.equal(node.props.style?.fontSize, undefined);
  }
});

test("buildConvertedTextNode preserves id", () => {
  const converted = buildConvertedTextNode(
    { id: "x", kind: "heading", props: { text: "A", level: 1 } },
    "paragraph",
  );
  assert.equal(converted.id, "x");
  assert.equal(converted.kind, "paragraph");
});
