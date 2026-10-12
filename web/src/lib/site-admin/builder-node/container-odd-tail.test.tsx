import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { containerOddTailAttrs } from "./render";
import type { BuilderContainerNode, BuilderNode } from "./types";

// GRK-080 uneven grids: valeria-baila's Solace photo band (solace-25) is a
// 2-column grid of five photos, so the fifth sat alone under the left column.

const img = (id: string) => ({ id, kind: "image", props: { src: `https://x/${id}.jpg`, alt: "" } }) as unknown as BuilderNode;
const text = (id: string) => ({ id, kind: "text", props: { text: "x" } }) as unknown as BuilderNode;

function grid(children: BuilderNode[], props: Partial<BuilderContainerNode["props"]> = {}): BuilderContainerNode {
  return { id: "c", kind: "container", props: { layout: "grid", columns: 2, ...props }, children } as BuilderContainerNode;
}

const five = ["a", "b", "c", "d", "e"].map(img);

test("an odd 2-column photo grid is marked, as on valeria-baila (mobile stack override allowed)", () => {
  assert.deepEqual(containerOddTailAttrs(grid(five, { responsive: { mobile: { layout: "stack" } } })), { "data-bn-odd-tail": "" });
  assert.deepEqual(containerOddTailAttrs(grid(five.slice(0, 3))), { "data-bn-odd-tail": "" });
});

test("everything else keeps identical markup", () => {
  const none = {};
  assert.deepEqual(containerOddTailAttrs(grid(five.slice(0, 4))), none, "even count");
  assert.deepEqual(containerOddTailAttrs(grid([...five.slice(0, 4), text("t")])), none, "not all photos");
  assert.deepEqual(containerOddTailAttrs(grid(five, { columns: 3 })), none, "three columns");
  assert.deepEqual(containerOddTailAttrs(grid(five, { layout: "stack" })), none, "stack");
  assert.deepEqual(containerOddTailAttrs(grid(five, { display: "slider" })), none, "slider");
  assert.deepEqual(containerOddTailAttrs(grid(five, { responsive: { tablet: { columns: 3 } } })), none, "tablet override");
  assert.deepEqual(containerOddTailAttrs(grid(five, { responsive: { wide: { columns: 3 } } })), none, "custom tier");
  assert.deepEqual(containerOddTailAttrs(grid(five, { instanceOf: "cmp" })), none, "linked instance");
});

test("from 641px the marked grid centres its last photo at the normal column width", () => {
  const src = readFileSync(path.join(__dirname, "render.tsx"), "utf8");
  assert.ok(
    src.includes(
      "@media (min-width:641px){.site-builder-node--container[data-bn-odd-tail]{grid-template-columns:repeat(4,minmax(0,1fr))}.site-builder-node--container[data-bn-odd-tail]>*{grid-column:span 2}.site-builder-node--container[data-bn-odd-tail]>:last-child{grid-column:2/span 2}}",
    ),
  );
  assert.ok(src.indexOf("[data-bn-odd-tail]{grid-template-columns") > src.indexOf('.site-builder-node--container[data-builder-layout="grid"],'), "after the base grid rule");
});
