import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addTranslateDeltaToTree,
  computeAlignDeltas,
  computeDistributeDeltas,
  mergeStylePatchIntoTree,
  type MultiNodeRect,
} from "./multi-node-layout";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node";

const rects: MultiNodeRect[] = [
  { id: "a", left: 10, top: 20, width: 20, height: 10 },
  { id: "b", left: 50, top: 30, width: 10, height: 10 },
  { id: "c", left: 100, top: 40, width: 20, height: 20 },
];

test("computeAlignDeltas aligns selected rects to the selection bounds", () => {
  assert.deepEqual(computeAlignDeltas(rects, "left"), {
    a: { x: 0, y: 0 },
    b: { x: -40, y: 0 },
    c: { x: -90, y: 0 },
  });
  assert.deepEqual(computeAlignDeltas(rects, "center"), {
    a: { x: 45, y: 0 },
    b: { x: 10, y: 0 },
    c: { x: -45, y: 0 },
  });
  assert.deepEqual(computeAlignDeltas(rects, "right"), {
    a: { x: 90, y: 0 },
    b: { x: 60, y: 0 },
    c: { x: 0, y: 0 },
  });
  assert.deepEqual(computeAlignDeltas(rects, "top"), {
    a: { x: 0, y: 0 },
    b: { x: 0, y: -10 },
    c: { x: 0, y: -20 },
  });
  assert.deepEqual(computeAlignDeltas(rects, "middle"), {
    a: { x: 0, y: 15 },
    b: { x: 0, y: 5 },
    c: { x: 0, y: -10 },
  });
  assert.deepEqual(computeAlignDeltas(rects, "bottom"), {
    a: { x: 0, y: 30 },
    b: { x: 0, y: 20 },
    c: { x: 0, y: 0 },
  });
});

test("computeDistributeDeltas spaces middle nodes evenly", () => {
  assert.deepEqual(computeDistributeDeltas(rects, "horizontal"), {
    a: { x: 0, y: 0 },
    b: { x: 10, y: 0 },
    c: { x: 0, y: 0 },
  });
  assert.deepEqual(computeDistributeDeltas([
    { id: "a", left: 10, top: 20, width: 20, height: 10 },
    { id: "b", left: 50, top: 70, width: 10, height: 10 },
    { id: "c", left: 100, top: 100, width: 20, height: 20 },
  ], "vertical"), {
    a: { x: 0, y: 0 },
    b: { x: 0, y: -10 },
    c: { x: 0, y: 0 },
  });
});

test("addTranslateDeltaToTree accumulates existing translate style", () => {
  const tree: BuilderNodeTree = [
    {
      id: "section",
      kind: "section",
      props: {
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "custom",
      },
      children: [
        {
          id: "a",
          kind: "heading",
          props: { text: "A", level: 2, style: { translate: "4px 5px" } },
        },
      ],
    },
  ];
  const next = addTranslateDeltaToTree(tree, { a: { x: 6, y: -2 } });
  const section = next[0];
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section") return;
  const heading = section.children?.[0];
  assert.equal(heading?.kind, "heading");
  if (!heading || heading.kind !== "heading") return;
  assert.deepEqual(heading.props.style, { translate: "10px 3px" });
});

function bulkEditTree(): BuilderNodeTree {
  return [
    {
      id: "section",
      kind: "section",
      props: {
        sectionId: "22222222-2222-4222-8222-222222222222",
        sectionTypeKey: "custom",
      },
      children: [
        {
          id: "a",
          kind: "heading",
          props: { text: "A", level: 2, style: { textColor: "#111", opacity: 0.5 } },
        },
        {
          id: "b",
          kind: "paragraph",
          props: { text: "B" },
        },
        {
          id: "c",
          kind: "paragraph",
          props: { text: "C", style: { textColor: "#abc" } },
        },
      ],
    },
  ];
}

/** Narrow a BuilderNode down to its `props.style` record for the assertions. */
function styleOf(node: BuilderNode | undefined): Record<string, unknown> | undefined {
  if (!node || node.kind === "section") return undefined;
  return (node.props as { style?: Record<string, unknown> }).style;
}

function hasStyleKey(node: BuilderNode | undefined): boolean {
  if (!node || node.kind === "section") return false;
  return "style" in node.props;
}

test("mergeStylePatchIntoTree merges a shared style onto every selected node", () => {
  const tree = bulkEditTree();
  const next = mergeStylePatchIntoTree(tree, ["a", "b"], { textColor: "#fff" });
  const section = next[0];
  if (!section || section.kind !== "section") {
    assert.fail("expected section");
    return;
  }
  const [a, b, c] = section.children ?? [];
  // 'a' keeps its other props, textColor overwritten.
  assert.deepEqual(styleOf(a), { textColor: "#fff", opacity: 0.5 });
  // 'b' gains a style object where there was none.
  assert.deepEqual(styleOf(b), { textColor: "#fff" });
  // 'c' is untouched (not in the selection) — same object identity.
  assert.equal(c, tree[0] && "children" in tree[0] ? tree[0].children?.[2] : undefined);
});

test("mergeStylePatchIntoTree deletes a key when the patch value is undefined", () => {
  const tree = bulkEditTree();
  const next = mergeStylePatchIntoTree(tree, ["a"], { textColor: undefined });
  const section = next[0];
  if (!section || section.kind !== "section") {
    assert.fail("expected section");
    return;
  }
  // textColor removed, opacity retained.
  assert.deepEqual(styleOf(section.children?.[0]), { opacity: 0.5 });
});

test("mergeStylePatchIntoTree drops an emptied style object from props", () => {
  const tree = bulkEditTree();
  const next = mergeStylePatchIntoTree(tree, ["c"], { textColor: undefined });
  const section = next[0];
  if (!section || section.kind !== "section") {
    assert.fail("expected section");
    return;
  }
  assert.equal(hasStyleKey(section.children?.[2]), false);
});

test("mergeStylePatchIntoTree never mutates a section node and no-ops on empty inputs", () => {
  const tree = bulkEditTree();
  // section id in the set is ignored (sections own their structure).
  assert.equal(mergeStylePatchIntoTree(tree, ["section"], { textColor: "#000" }), tree);
  // empty selection / empty patch return the SAME tree reference.
  assert.equal(mergeStylePatchIntoTree(tree, [], { textColor: "#000" }), tree);
  assert.equal(mergeStylePatchIntoTree(tree, ["a"], {}), tree);
});

// ── INS-2 ────────────────────────────────────────────────────────────────────

/** Like bulkEditTree but 'a' locks `style.textColor` (INS-1 per-prop lock). */
function lockedBulkEditTree(): BuilderNodeTree {
  const tree = bulkEditTree();
  const section = tree[0];
  if (section && "children" in section && section.children) {
    const a = section.children[0] as BuilderNode & {
      lockedProps?: string[];
    };
    a.lockedProps = ["style.textColor"];
  }
  return tree;
}

test("mergeStylePatchIntoTree honors a per-node INS-1 lock in a bulk patch", () => {
  const tree = lockedBulkEditTree();
  // 'a' locks style.textColor; 'b' is unlocked. The bulk patch sets textColor.
  const next = mergeStylePatchIntoTree(tree, ["a", "b"], { textColor: "#fff" });
  const section = next[0];
  if (!section || section.kind !== "section") {
    assert.fail("expected section");
    return;
  }
  const [a, b] = section.children ?? [];
  // 'a' keeps its locked value — the bulk edit did NOT bypass the lock.
  assert.deepEqual(styleOf(a), { textColor: "#111", opacity: 0.5 });
  // 'b' (unlocked) received the new value.
  assert.deepEqual(styleOf(b), { textColor: "#fff" });
});

test("mergeStylePatchIntoTree leaves a fully-locked node byte-identical", () => {
  const tree = lockedBulkEditTree();
  // Only patch the locked key → 'a' should be untouched (same object identity).
  const next = mergeStylePatchIntoTree(tree, ["a"], { textColor: "#fff" });
  // No node changed → the SAME tree reference comes back.
  assert.equal(next, tree);
});

test("mergeStylePatchIntoTree writes into a responsive bucket when bucket is set", () => {
  const tree = bulkEditTree();
  const next = mergeStylePatchIntoTree(
    tree,
    ["a", "b"],
    { textColor: "#0f0" },
    "mobile",
  );
  const section = next[0];
  if (!section || section.kind !== "section") {
    assert.fail("expected section");
    return;
  }
  const [a, b] = section.children ?? [];
  // Base style is untouched; the override lands under responsive.mobile.
  assert.deepEqual(styleOf(a), {
    textColor: "#111",
    opacity: 0.5,
    responsive: { mobile: { textColor: "#0f0" } },
  });
  assert.deepEqual(styleOf(b), {
    responsive: { mobile: { textColor: "#0f0" } },
  });
});
