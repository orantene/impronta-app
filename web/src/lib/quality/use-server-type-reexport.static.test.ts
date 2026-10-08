/**
 * A "use server" file must never `export type { X }` (a local re-export without `from`) or re-export a type
 * it imported. Turbopack leaves a runtime reference for it, and the COMPILED server throws
 * "ReferenceError: X is not defined" at module evaluation, so every route that imports the module 500s
 * (batch 7c: /impronta/admin, from profile-shell-media-actions.ts). It never shows in tests or tsc.
 * Export types from a plain module and import them from there.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const SRC = join(WEB_ROOT, "src");
const SKIP = new Set(["node_modules", ".next"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(join(dir, e.name), out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

/** The directive must be the first statement (comments and blank lines may precede it). */
export function isUseServerFile(src: string): boolean {
  const stripped = src.replace(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^["']use server["']/.test(stripped);
}

/** `export type { A, B };` with no `from`: a local re-export of a type. */
export function localTypeReexports(src: string): string[] {
  return [...src.matchAll(/^\s*export\s+type\s*\{([^}]*)\}\s*;?\s*$/gm)].map((m) => m[0].trim());
}

test("no \"use server\" file re-exports a type locally (export type { X } without from)", () => {
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!isUseServerFile(src)) continue;
    for (const hit of localTypeReexports(src)) bad.push(`${relative(WEB_ROOT, file)}: ${hit}`);
  }
  assert.deepEqual(bad, [], `Move the type export to a plain module:\n${bad.join("\n")}`);
});

test("GUARD BITES: the detector flags the bad shape and spares the good ones", () => {
  const bad = `"use server";\nimport { a, type T } from "./x";\nexport type { T };\nexport async function f() {}\n`;
  assert.equal(isUseServerFile(bad), true);
  assert.equal(localTypeReexports(bad).length, 1);
  assert.equal(localTypeReexports(`"use server";\nexport type { T } from "./x";\n`).length, 0);
  assert.equal(localTypeReexports(`"use server";\nexport type T = { a: 1 };\n`).length, 0);
  assert.equal(isUseServerFile(`// c\n/* d */\n"use server";\n`), true);
  assert.equal(isUseServerFile(`import x from "y";\n"use server";\n`), false);
});
