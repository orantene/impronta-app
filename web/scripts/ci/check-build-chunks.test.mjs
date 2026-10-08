import assert from "node:assert/strict";
import { test } from "node:test";
import { extractClientChunkRefs, findMissingClientChunks } from "./check-build-chunks.mjs";

const manifest = (...refs) =>
  `globalThis.__RSC_MANIFEST["/x/page"]={"clientModules":{"a":{"chunks":[${refs
    .map((r) => `"${r}"`)
    .join(",")}]}}}`;

test("all referenced chunks present -> []", () => {
  const manifests = {
    a: manifest("/_next/static/chunks/app/a-1.js", "static/chunks/b-2.js"),
  };
  const staticChunks = new Set(["app/a-1.js", "b-2.js"]);
  assert.deepEqual(findMissingClientChunks({ manifests, staticChunks }), []);
});

test("one missing chunk is reported", () => {
  const manifests = { a: manifest("/_next/static/chunks/app/a-1.js", "/_next/static/chunks/gone-9.js") };
  const staticChunks = new Set(["app/a-1.js"]);
  assert.deepEqual(findMissingClientChunks({ manifests, staticChunks }), ["gone-9.js"]);
});

test("ssr/ refs are ignored even when absent", () => {
  const manifests = { a: manifest("/_next/static/chunks/ssr/server-only.js", "static/chunks/ssr/x.js") };
  assert.deepEqual(findMissingClientChunks({ manifests, staticChunks: new Set() }), []);
});

test("duplicates across and within manifests collapse to one entry", () => {
  const ref = "/_next/static/chunks/dup-3.js";
  const manifests = { a: manifest(ref, ref), b: manifest(ref, "static/chunks/dup-3.js") };
  assert.deepEqual(findMissingClientChunks({ manifests, staticChunks: new Set() }), ["dup-3.js"]);
});

test("extractClientChunkRefs sees both reference forms", () => {
  const refs = extractClientChunkRefs(manifest("/_next/static/chunks/p.js", "static/chunks/q.css"));
  assert.deepEqual([...refs].sort(), ["p.js", "q.css"]);
});

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { fileURLToPath as toPath } from "node:url";

const CLI = toPath(new URL("./check-build-chunks.mjs", import.meta.url));

test("CLI: strict mode exits 1 on a directory that is not a build", () => {
  const dir = mkdtempSync(pathJoin(tmpdir(), "cbc-"));
  const r = spawnSync(process.execPath, [CLI, dir], { encoding: "utf8" });
  assert.equal(r.status, 1);
});

test("CLI: --warn never fails (exit 0) and says WARN on a directory that is not a build", () => {
  const dir = mkdtempSync(pathJoin(tmpdir(), "cbc-"));
  const r = spawnSync(process.execPath, [CLI, dir, "--warn"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /check-build-chunks WARN/);
});
