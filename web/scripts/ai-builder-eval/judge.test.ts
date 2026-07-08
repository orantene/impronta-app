import { test } from "node:test";
import assert from "node:assert/strict";

import { validateScores, serializeTree } from "./judge";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";

test("validateScores accepts a well-formed 7-axis object + computes mean", () => {
  const ok = validateScores({
    copy_voice: 4, hierarchy: 5, component_fit: 4, readability: 5,
    responsiveness: 3, brand: 5, premium_feel: 4, notes: "solid",
  });
  assert.ok(ok);
  assert.equal(ok!.axes.hierarchy, 5);
  assert.ok(ok!.mean > 3 && ok!.mean < 5);
  assert.equal(ok!.notes, "solid");
});

test("validateScores rejects out-of-range, non-integer, and missing axes", () => {
  assert.equal(validateScores({ copy_voice: 9 }), null);
  assert.equal(validateScores({ copy_voice: 4.5, hierarchy: 5, component_fit: 4, readability: 5, responsiveness: 3, brand: 5, premium_feel: 4 }), null);
  assert.equal(validateScores({ copy_voice: "5" }), null);
  assert.equal(validateScores(null), null);
  assert.equal(validateScores("nope"), null);
});

test("serializeTree renders kind + copy + level for a hero", () => {
  const tree: BuilderNode[] = [
    { id: "s", kind: "section", props: { sectionTypeKey: "custom", label: "Hero" }, children: [
      { id: "e", kind: "paragraph", props: { text: "MILAN", style: { tone: "muted" } } },
      { id: "h", kind: "heading", props: { text: "Faces that move culture", level: 1 } },
    ] },
  ] as unknown as BuilderNode[];
  const s = serializeTree(tree);
  assert.match(s, /heading \[.*h1/);
  assert.match(s, /paragraph \[MILAN/);
  assert.match(s, /muted/);
});
