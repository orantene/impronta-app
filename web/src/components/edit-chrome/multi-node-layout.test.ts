import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addTranslateDeltaToTree,
  computeAlignDeltas,
  computeDistributeDeltas,
  type MultiNodeRect,
} from "./multi-node-layout";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";

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
  assert.deepEqual(computeAlignDeltas(rects, "middle"), {
    a: { x: 0, y: 15 },
    b: { x: 0, y: 5 },
    c: { x: 0, y: -10 },
  });
});

test("computeDistributeDeltas spaces middle nodes evenly", () => {
  const deltas = computeDistributeDeltas(rects, "horizontal");
  assert.deepEqual(deltas.a, { x: 0, y: 0 });
  assert.deepEqual(deltas.b, { x: 10, y: 0 });
  assert.deepEqual(deltas.c, { x: 0, y: 0 });
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
