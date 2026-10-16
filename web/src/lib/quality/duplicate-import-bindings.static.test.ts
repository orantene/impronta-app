/**
 * No file may import the same local name twice (default + named, `as` aliases,
 * `type` imports all count). Existing offenders, if any, live in
 * duplicate-import-bindings.baseline.json; the list may only shrink.
 * Fix: delete the duplicate import line (usually left by a hand-merge).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT, findDuplicateImportBindings, scanTree } from "./duplicate-import-bindings";

const names = (src: string) => findDuplicateImportBindings(src).map((d) => d.name);

test("self-test: flags the same name imported twice", () => {
  assert.deepEqual(names(`import { a } from 'x';\nimport { a } from 'y';`), ["a"]);
  assert.deepEqual(names(`import a from 'x';\nimport { b as a } from 'y';`), ["a"]);
  assert.deepEqual(names(`import type { A } from 'x';\nimport type { A } from 'y';`), ["A"]);
  assert.deepEqual(names(`import { A } from 'x';\nimport { type A } from 'y';`), ["A"]);
  assert.deepEqual(names(`import { a, a } from 'x';\nimport z from 'z';`), ["a"]);
  assert.deepEqual(names(`import * as ns from 'x';\nimport ns from 'y';`), ["ns"]);
});

test("self-test: reports the line of the second import", () => {
  const d = findDuplicateImportBindings(`import { a } from 'x';\n\nimport { a } from 'y';`);
  assert.equal(d[0].line, 3);
  assert.equal(d[0].firstLine, 1);
});

test("self-test: legitimate imports are not flagged", () => {
  assert.deepEqual(names(`import type { A } from 'x';\nimport { type B } from 'x';`), []);
  assert.deepEqual(names(`import a from 'x';\nimport { b as c } from 'x';\nimport * as d from 'y';`), []);
  assert.deepEqual(names(`import { a as b } from 'x';\nimport { b as a } from 'y';`), []);
  assert.deepEqual(names(`import 'side-effect';\nimport 'side-effect';`), []);
  assert.deepEqual(names("const s = `\nimport { a } from 'x';\nimport { a } from 'y';\n`;"), []);
});

test("no file under src/ or emails/ imports the same name twice", () => {
  const basePath = join(WEB_ROOT, "src/lib/quality/duplicate-import-bindings.baseline.json");
  const baseline: string[] = existsSync(basePath) ? JSON.parse(readFileSync(basePath, "utf8")).files : [];
  const key = (s: string) => s.replace(/:\d+ /, " ");
  const allowed = new Set(baseline);
  const fresh = scanTree().filter((s) => !allowed.has(key(s)));
  assert.deepEqual(
    fresh,
    [],
    `Duplicate import bindings (delete the repeated import, usually a hand-merge leftover):\n${fresh.join("\n")}`,
  );
});
