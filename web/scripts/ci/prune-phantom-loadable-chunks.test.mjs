import assert from "node:assert/strict";
import { test } from "node:test";
import { pruneLoadableManifest } from "./prune-phantom-loadable-chunks.mjs";

test("drops only chunk files that are not on disk and keeps ids and order", () => {
  const manifest = {
    "1": { id: 1, files: ["static/chunks/a.js", "static/chunks/gone.js", "static/chunks/b.css"] },
    "2": { id: 2, files: ["static/chunks/gone2.js"] },
  };
  const { pruned, manifest: out } = pruneLoadableManifest(manifest, new Set(["a.js", "b.css"]));
  assert.deepEqual(pruned, ["static/chunks/gone.js", "static/chunks/gone2.js"]);
  assert.deepEqual(out["1"], { id: 1, files: ["static/chunks/a.js", "static/chunks/b.css"] });
  assert.deepEqual(out["2"], { id: 2, files: [] });
});

test("a manifest with every file present is unchanged", () => {
  const manifest = { "1": { id: 1, files: ["static/chunks/a.js"] } };
  const { pruned, manifest: out } = pruneLoadableManifest(manifest, new Set(["a.js"]));
  assert.deepEqual(pruned, []);
  assert.deepEqual(out, manifest);
});

test("non-chunk entries and malformed entries pass through without throwing", () => {
  const manifest = { "1": { id: 1, files: ["other/x.js"] }, "2": null };
  const { pruned } = pruneLoadableManifest(manifest, new Set());
  assert.deepEqual(pruned, []);
});
