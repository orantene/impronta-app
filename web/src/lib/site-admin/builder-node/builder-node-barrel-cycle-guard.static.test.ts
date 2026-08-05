/**
 * builder-node-barrel-cycle-guard.static.test.ts — INTRA-PACKAGE barrel-import
 * freeze (B3, the #971 TDZ incident class).
 *
 * WHAT THIS TEST DOES
 * ───────────────────
 * Reads the SOURCE TEXT of every file under `src/lib/site-admin/builder-node/**`
 * and FAILS if any of them imports its OWN package barrel
 * (`@/lib/site-admin/builder-node`, or a relative specifier that resolves to the
 * package `index`). Siblings must be imported directly (`./registry`,
 * `./types`, `./render`, …).
 *
 * WHY
 * ───
 * PR #971 took production admin DOWN with a module-evaluation crash: a file
 * inside a package imported a RUNTIME value from its own barrel, the barrel
 * re-exported that same file, and the resulting ES-module cycle left the value
 * in its Temporal Dead Zone when the chunk evaluated. `ReferenceError: Cannot
 * access '…' before initialization` at import time — the page never renders.
 *
 * Nothing in the existing pipeline catches this:
 *   • `tsc --noEmit`  — types resolve fine through a cycle.
 *   • `eslint`        — no rule flags a value cycle.
 *   • `next build`    — bundles cycles happily; the throw is at RUNTIME.
 *   • unit tests      — only if a test happens to import the crashing chunk in
 *                       the exact order the browser does.
 *
 * The only cheap, deterministic gate is a static source scan for the edge that
 * creates the cycle in the first place: a package file reaching back through its
 * own barrel. Forbid the edge and the cycle cannot form, regardless of what the
 * barrel re-exports.
 *
 * The concrete trap this froze: `freeform-layer-name.ts` imported the runtime
 * `BUILDER_NODE_REGISTRY` from `@/lib/site-admin/builder-node`. The barrel did
 * NOT re-export that module, so there was no cycle yet — but adding the routine
 * `export * from "./freeform-layer-name"` line would have created one instantly,
 * with prod as the first place anyone found out. It now imports `./registry` +
 * `./types` directly.
 *
 * WHY A FILE-TEXT SCAN (not a real import graph)?
 * ───────────────────────────────────────────────
 * Importing these modules under `node:test` pulls the React / Next / server-
 * action graph that cannot evaluate outside Next.js — the very fragility this
 * guard exists to protect. A UTF-8 text scan is zero-dependency, runs in
 * milliseconds, and catches exactly the module specifier that matters.
 *
 * Modeled on `builder-core/lib-edit-chrome-cycle-guard.static.test.ts`.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/builder-node-barrel-cycle-guard.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/** This file lives at web/src/lib/site-admin/builder-node/. */
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));

/** The package barrel, by alias. */
const BARREL_ALIAS = "@/lib/site-admin/builder-node";

/**
 * A module specifier in `import … from "…"`, `export … from "…"`, or a dynamic
 * `import("…")`. Comments are stripped first so prose that merely NAMES the
 * barrel (this file's own header, for instance) is not treated as an edge.
 */
const FROM_SPECIFIER_RE = /\bfrom\s*["'`]([^"'`]+)["'`]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

/** Strip block and line comments so documentation prose is ignored. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

/**
 * True when `spec`, written inside `fileDir`, resolves to this package's barrel.
 *
 * Two shapes count:
 *   • the alias `@/lib/site-admin/builder-node` (with or without a trailing
 *     `/index`), and
 *   • a relative specifier that lands on the package directory itself or its
 *     `index` file (`.`, `..`, `../builder-node`, `./index`, …).
 */
function isOwnBarrelSpecifier(spec: string, fileDir: string): boolean {
  const bare = spec.replace(/\/index$/, "");
  if (bare === BARREL_ALIAS) return true;
  if (!spec.startsWith(".")) return false;
  const resolved = resolve(fileDir, bare);
  return resolved === PACKAGE_DIR;
}

/** The guard's own file quotes the barrel specifier in fixtures — skip it. */
const SELF_BASENAME = basename(fileURLToPath(import.meta.url));

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (st.isFile()) {
      const ext = extname(name);
      if (ext === ".ts" || ext === ".tsx") out.push(full);
    }
  }
  return out;
}

/** Every distinct own-barrel specifier imported by `source`. */
function ownBarrelSpecifiersIn(source: string, fileDir: string): string[] {
  const code = stripComments(source);
  const found = new Set<string>();
  for (const re of [FROM_SPECIFIER_RE, DYNAMIC_IMPORT_RE]) {
    for (const m of code.matchAll(re)) {
      const spec = m[1]!;
      if (isOwnBarrelSpecifier(spec, fileDir)) found.add(spec);
    }
  }
  return [...found];
}

// ── Self-checks: the matcher must actually work ───────────────────────────────

test("self-check: matcher catches the @/ alias barrel import", () => {
  const specs = ownBarrelSpecifiersIn(
    `import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node";`,
    PACKAGE_DIR,
  );
  assert.deepEqual(specs, [BARREL_ALIAS]);
});

test("self-check: matcher catches a relative barrel import", () => {
  const specs = ownBarrelSpecifiersIn(
    `import { X } from "..";`,
    join(PACKAGE_DIR, "page-designs"),
  );
  assert.deepEqual(specs, [".."]);
});

test("self-check: matcher ignores direct sibling imports", () => {
  const specs = ownBarrelSpecifiersIn(
    `import { BUILDER_NODE_REGISTRY } from "./registry";\n` +
      `import type { BuilderNode } from "./types";\n` +
      `import { x } from "@/lib/site-admin/builder-core";`,
    PACKAGE_DIR,
  );
  assert.deepEqual(specs, []);
});

test("self-check: matcher ignores the barrel named only in a comment", () => {
  const specs = ownBarrelSpecifiersIn(
    `// never import from "@/lib/site-admin/builder-node" in here\nconst a = 1;`,
    PACKAGE_DIR,
  );
  assert.deepEqual(specs, []);
});

// ── The real scan ─────────────────────────────────────────────────────────────

test("builder-node/** must not import its own package barrel (TDZ cycle trap)", () => {
  const violations: string[] = [];

  for (const file of collectSourceFiles(PACKAGE_DIR)) {
    if (basename(file) === SELF_BASENAME) continue;
    const specs = ownBarrelSpecifiersIn(readFileSync(file, "utf8"), dirname(file));
    for (const spec of specs) {
      violations.push(`${file.slice(PACKAGE_DIR.length + 1)}  →  ${spec}`);
    }
  }

  assert.equal(
    violations.length,
    0,
    "INTRA-PACKAGE barrel import detected inside lib/site-admin/builder-node. " +
      "A package file that imports its own barrel forms an ES-module cycle the " +
      "moment the barrel re-exports it, and a RUNTIME value read through that " +
      "cycle throws at module-eval time (TDZ) — the #971 production outage. " +
      "Import the sibling module DIRECTLY (e.g. `./registry`, `./types`) " +
      "instead. Offenders:\n  " +
      violations.join("\n  "),
  );
});
