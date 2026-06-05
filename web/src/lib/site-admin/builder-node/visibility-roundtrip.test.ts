import assert from "node:assert/strict";
import test from "node:test";

import { patchBuilderNodeProps } from "./operations";
import type { BuilderNode, BuilderNodeTree } from "./types";
import { validateBuilderNodeTree } from "./validate";
import { getBuilderNodeVisibilityCondition } from "./visibility";

function tree(): BuilderNodeTree {
  return [
    {
      id: "root",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "h1", kind: "heading", props: { text: "Hi", level: 2 } },
      ],
    },
  ] as BuilderNodeTree;
}

// ── validate carries the base-level optional fields ──────────────────────────

test("validate lifts a base-level visibilityCondition through reconstruction", () => {
  const input = [
    {
      id: "root",
      kind: "container",
      visibilityCondition: { locale: "es" },
      props: { layout: "stack" },
      children: [],
    },
  ];
  const result = validateBuilderNodeTree(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    getBuilderNodeVisibilityCondition(result.tree[0]),
    { locale: "es" },
  );
});

test("validate lifts a visibilityCondition stored in props (the patch landing zone)", () => {
  const input = [
    {
      id: "root",
      kind: "container",
      // patchBuilderNodeProps writes the rule into props; validate must lift it.
      props: { layout: "stack", visibilityCondition: { auth: "signed_in" } },
      children: [],
    },
  ];
  const result = validateBuilderNodeTree(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const node = result.tree[0] as BuilderNode;
  // Mirrored to the base for the renderer/typed access…
  assert.deepEqual(node.visibilityCondition, { auth: "signed_in" });
  // …and kept in props as the source of truth (so change-detection / clear work).
  assert.deepEqual(
    (node.props as Record<string, unknown>).visibilityCondition,
    { auth: "signed_in" },
  );
});

test("a garbage visibilityCondition is dropped, not poisoning the node", () => {
  const input = [
    {
      id: "root",
      kind: "container",
      visibilityCondition: { locale: "klingon" },
      props: { layout: "stack" },
      children: [],
    },
  ];
  const result = validateBuilderNodeTree(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(getBuilderNodeVisibilityCondition(result.tree[0]), null);
});

test("validate also carries base-level locked (previously dropped)", () => {
  const input = [
    {
      id: "root",
      kind: "container",
      locked: true,
      props: { layout: "stack" },
      children: [],
    },
  ];
  const result = validateBuilderNodeTree(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.tree[0] as BuilderNode).locked, true);
});

// ── the editor patch path persists a visibility rule end-to-end ──────────────

test("patchBuilderNodeProps({ visibilityCondition }) survives the validate finalize", () => {
  const result = patchBuilderNodeProps({
    tree: tree(),
    nodeId: "h1",
    patch: { visibilityCondition: { locale: "en", auth: "signed_out" } },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const child = (result.tree[0] as BuilderNode & { children: BuilderNode[] })
    .children[0];
  assert.deepEqual(getBuilderNodeVisibilityCondition(child), {
    locale: "en",
    auth: "signed_out",
  });
});

test("clearing the rule (patch undefined) removes it", () => {
  const set = patchBuilderNodeProps({
    tree: tree(),
    nodeId: "h1",
    patch: { visibilityCondition: { locale: "es" } },
  });
  assert.equal(set.ok, true);
  if (!set.ok) return;
  const cleared = patchBuilderNodeProps({
    tree: set.tree,
    nodeId: "h1",
    patch: { visibilityCondition: undefined },
  });
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  const child = (cleared.tree[0] as BuilderNode & { children: BuilderNode[] })
    .children[0];
  assert.equal(getBuilderNodeVisibilityCondition(child), null);
});
