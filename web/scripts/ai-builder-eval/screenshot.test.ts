import { test } from "node:test";
import assert from "node:assert/strict";

import { countByteDifferences } from "./screenshot";

test("countByteDifferences: identical buffers → 0", () => {
  assert.equal(countByteDifferences(Buffer.from("ab"), Buffer.from("ab")), 0);
});

test("countByteDifferences: content diff counted", () => {
  assert.equal(countByteDifferences(Buffer.from("abc"), Buffer.from("axd")), 2);
});

test("countByteDifferences: length delta counted", () => {
  assert.equal(countByteDifferences(Buffer.from("abc"), Buffer.from("ab")), 1);
});
