import test from "node:test";
import assert from "node:assert/strict";
import { classify, repairTree, scanTree } from "./repair-duplicate-ids-lib";

test("scan reports a tree with duplicate ids and skips a clean one", () => {
  const dirty = [{ id: "maison-v2-39" }, { id: "x", children: [{ id: "maison-v2-39" }] }];
  assert.deepEqual(scanTree("draft", dirty), { where: "draft", duplicates: ["maison-v2-39"] });
  assert.equal(scanTree("draft", [{ id: "a" }, { id: "b" }]), null);
  assert.equal(scanTree("draft", null), null);
});

test("repair yields a clean tree", () => {
  const out = repairTree([{ id: "a" }, { id: "a" }]);
  assert.equal(scanTree("x", out.tree), null);
  assert.equal(out.remapped, 1);
});

test("classify buckets demo, qa and real talents", () => {
  assert.equal(classify("TAL-93900"), "demo");
  assert.equal(classify("TAL-QAFIXFREE"), "qa");
  assert.equal(classify("TAL-12345"), "real");
});
