import assert from "node:assert/strict";
import { test } from "node:test";

import { isIncomplete, moveItem, newBlock, savableBlocks } from "./editor-blocks";

const OFFERING = "11111111-1111-4111-8111-111111111111";

test("a fresh text block saves; a fresh service, photo, gallery and video do not", () => {
  assert.equal(savableBlocks([newBlock("paragraph", "a")]).length, 1);
  assert.equal(savableBlocks([newBlock("divider", "d")]).length, 1);
  assert.equal(savableBlocks([newBlock("faq", "f")]).length, 1);
  for (const type of ["service", "image", "gallery", "video"] as const) {
    assert.equal(isIncomplete(newBlock(type, "x")), true, type);
  }
});

test("a block saves once its required prop is set", () => {
  const service = { ...newBlock("service", "s"), offering_id: OFFERING };
  assert.equal(isIncomplete(service), false);
  const video = { ...newBlock("video", "v"), url: "https://youtu.be/dQw4w9WgXcQ" };
  assert.equal(isIncomplete(video), false);
  const badVideo = { ...newBlock("video", "v2"), url: "https://example.com/x" };
  assert.equal(isIncomplete(badVideo), true);
});

test("savableBlocks drops only the incomplete ones and keeps order", () => {
  const out = savableBlocks([newBlock("paragraph", "a"), newBlock("service", "b"), newBlock("heading", "c")]);
  assert.deepEqual(out.map((b) => b.id), ["a", "c"]);
});

test("moveItem swaps neighbours and ignores out-of-range moves", () => {
  assert.deepEqual(moveItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 2, 3), [1, 2, 3]);
});
