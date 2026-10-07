import assert from "node:assert/strict";
import { test } from "node:test";

import { createBuilderNode } from "./create";
import { wrapNodeForRootInsert } from "./wrap-for-root";

test("root-allowed kinds are returned untouched", () => {
  const n = createBuilderNode("container");
  assert.equal(wrapNodeForRootInsert(n), n);
});

test("a paragraph is wrapped in a section", () => {
  const n = createBuilderNode("paragraph");
  const w = wrapNodeForRootInsert(n);
  assert.ok(w);
  assert.equal(w.kind, "section");
  assert.equal(w.children?.at(-1), n);
});

test("a kind no section can hold returns null", () => {
  const n = createBuilderNode("accordion_item");
  assert.equal(wrapNodeForRootInsert(n), null);
});
