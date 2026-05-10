import assert from "node:assert/strict";
import test from "node:test";

import { moveBuilderNode } from "./operations";
import type { BuilderNodeTree } from "./types";
import { siblingDropGapToMoveIndex } from "./sibling-drop-gap";

function fixtureSectionWithChildren(): BuilderNodeTree {
  return [
    {
      id: "section-1",
      kind: "section",
      props: {
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "hero",
        slotKey: "body",
        sortOrder: 0,
      },
      children: [
        {
          id: "n-a",
          kind: "heading",
          props: { text: "A", level: 2 },
        },
        {
          id: "n-b",
          kind: "paragraph",
          props: { text: "B" },
        },
        {
          id: "n-c",
          kind: "paragraph",
          props: { text: "C" },
        },
      ],
    },
  ];
}

/** Naive “remove then insert” order used to double-check gap semantics. */
function orderAfterGapMove(
  ids: readonly string[],
  sourceIdx: number,
  dropGap: number,
): string[] {
  const out = [...ids];
  const [x] = out.splice(sourceIdx, 1);
  let ins = dropGap;
  if (dropGap > sourceIdx) ins -= 1;
  out.splice(ins, 0, x);
  return out;
}

test("siblingDropGapToMoveIndex unit cases", () => {
  assert.equal(
    siblingDropGapToMoveIndex({
      dropGapIndex: 2,
      sourceSiblingIndex: 2,
      sameParent: true,
    }).kind,
    "noop",
  );
  assert.deepEqual(
    siblingDropGapToMoveIndex({
      dropGapIndex: 4,
      sourceSiblingIndex: 2,
      sameParent: true,
    }),
    { kind: "move", targetSiblingIndex: 3 },
  );
  assert.deepEqual(
    siblingDropGapToMoveIndex({
      dropGapIndex: 1,
      sourceSiblingIndex: 4,
      sameParent: false,
    }),
    { kind: "move", targetSiblingIndex: 1 },
  );
});

test("P7A-3: every same-parent gap agrees with moveBuilderNode for 3 siblings", () => {
  const parentId = "section-1";
  const tree = fixtureSectionWithChildren();
  const section = tree[0];
  assert.equal(section?.kind, "section");
  if (!section || section.kind !== "section" || !section.children) return;
  const ids = section.children.map((c) => c.id);

  for (let sourceIdx = 0; sourceIdx < ids.length; sourceIdx++) {
    for (let dropGap = 0; dropGap <= ids.length; dropGap++) {
      const resolved = siblingDropGapToMoveIndex({
        dropGapIndex: dropGap,
        sourceSiblingIndex: sourceIdx,
        sameParent: true,
      });
      const expected =
        resolved.kind === "noop"
          ? [...ids]
          : orderAfterGapMove(ids, sourceIdx, dropGap);
      if (resolved.kind === "noop") {
        assert.deepEqual(expected, ids);
        continue;
      }
      const moved = moveBuilderNode({
        tree: fixtureSectionWithChildren(),
        nodeId: ids[sourceIdx]!,
        parentId,
        index: resolved.targetSiblingIndex,
      });
      assert.equal(moved.ok, true);
      if (!moved.ok) return;
      const nextSection = moved.tree.find((n) => n.id === parentId);
      assert.equal(nextSection?.kind, "section");
      if (!nextSection || nextSection.kind !== "section" || !nextSection.children) {
        return;
      }
      assert.deepEqual(
        nextSection.children.map((c) => c.id),
        expected,
        `sourceIdx=${sourceIdx} dropGap=${dropGap} resolved=${JSON.stringify(resolved)}`,
      );
    }
  }
});

test("P7A-3: cross-parent drop index passes through to moveBuilderNode", () => {
  const tree: BuilderNodeTree = [
    {
      id: "section-1",
      kind: "section",
      props: {
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "hero",
        slotKey: "body",
        sortOrder: 0,
      },
      children: [
        {
          id: "n-a",
          kind: "heading",
          props: { text: "A", level: 2 },
        },
      ],
    },
    {
      id: "container-1",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "n-x",
          kind: "paragraph",
          props: { text: "X" },
        },
      ],
    },
  ];
  const resolved = siblingDropGapToMoveIndex({
    dropGapIndex: 0,
    sourceSiblingIndex: 0,
    sameParent: false,
  });
  assert.deepEqual(resolved, { kind: "move", targetSiblingIndex: 0 });
  const moved = moveBuilderNode({
    tree,
    nodeId: "n-a",
    parentId: "container-1",
    index: resolved.targetSiblingIndex,
  });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const container = moved.tree.find((n) => n.id === "container-1");
  assert.equal(container?.kind, "container");
  if (!container || container.kind !== "container") return;
  assert.deepEqual(container.children.map((c) => c.id), ["n-a", "n-x"]);
});
