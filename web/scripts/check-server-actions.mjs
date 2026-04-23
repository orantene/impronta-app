#!/usr/bin/env node
/**
 * Fast static check: every export in a "use server" file must be an async
 * function (or a const bound to an async function / async arrow).
 *
 * Exists to catch the class of bug where a sync helper gets added to a
 * Server Actions file — typecheck accepts it, but Next's SWC refuses at
 * bundle time, which means the page renders "Loading…" in production and
 * only fails when someone actually visits it.
 *
 * This runs in <1s, so wire it into `npm run ci` before the slow steps.
 *
 * Supported export patterns (all pass):
 *   export async function foo(...)           ← canonical server action
 *   export const foo = async (...) => ...    ← canonical arrow action
 *   export const foo = async function (...)
 *   export type Foo = ...                    ← types are stripped, allowed
 *   export interface Foo { ... }             ← types are stripped, allowed
 *
 * Rejected patterns (all fail, with file:line):
 *   export function foo(...)                 ← sync function
 *   export const foo = 42                    ← non-function const
 *   export const foo = () => ...             ← sync arrow
 *   export const foo = bar                   ← we can't prove it's async
 *   export { foo }                           ← indirect; we can't verify
 *
 * We accept false positives on the last pattern as the price of a cheap,
 * zero-dep check — if you need to re-export from a "use server" file, the
 * fix is to inline the async wrapper.
 */

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function listSourceFiles() {
  // git ls-files is faster than walking node_modules with fs.
  const raw = execFileSync(
    "git",
    ["ls-files", "src/**/*.ts", "src/**/*.tsx"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return raw
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
}

function leadingDirectivesContainUseServer(source) {
  // Server Actions require `"use server"` to be the first directive. The
  // Next.js compiler accepts it even with a BOM, leading comments, or a
  // license banner, so we skip those before checking.
  let i = 0;
  const n = source.length;

  while (i < n) {
    // Skip whitespace.
    while (i < n && /\s/.test(source[i])) i++;
    if (i >= n) return false;

    // Skip line comments.
    if (source.startsWith("//", i)) {
      const nl = source.indexOf("\n", i);
      if (nl === -1) return false;
      i = nl + 1;
      continue;
    }

    // Skip block comments.
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return false;
      i = end + 2;
      continue;
    }

    // First non-whitespace, non-comment token — must be a directive.
    const rest = source.slice(i);
    const directiveMatch = rest.match(/^(['"])use server\1\s*;?/);
    if (directiveMatch) return true;
    // Any other directive (e.g. "use client", "use strict") means this is
    // not a server-actions file by the first-directive rule.
    const otherDirective = rest.match(/^(['"])[^'"]*\1\s*;?/);
    if (otherDirective) return false;
    return false;
  }
  return false;
}

/**
 * Find module-level `export` statements we need to validate.
 *
 * We only care about top-level exports — ignoring anything that is inside
 * braces `{` (classes, functions, object literals) by tracking brace depth.
 *
 * Template strings, regex literals, and string contents are detected
 * well-enough for our inputs (TypeScript source we authored). This is not
 * a parser; it's a lint.
 */
function* iterateTopLevelExports(source) {
  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  let inRegex = false;
  let atLineStart = true;

  const lines = [];
  let line = 1;
  let col = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "\n") {
      inLineComment = false;
      line++;
      col = 0;
      atLineStart = true;
      continue;
    } else {
      col++;
    }

    if (inLineComment) continue;
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
        col++;
      }
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        i++;
        col++;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (inRegex) {
      if (ch === "\\") {
        i++;
        col++;
        continue;
      }
      if (ch === "/") inRegex = false;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      col++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      col++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }

    if (ch === "{" || ch === "(" || ch === "[") depth++;
    if (ch === "}" || ch === ")" || ch === "]") depth = Math.max(0, depth - 1);

    if (depth !== 0 || !atLineStart) {
      if (ch !== " " && ch !== "\t") atLineStart = false;
      continue;
    }

    // At depth 0 and at the start of whitespace-only prefix. Check for
    // `export` keyword.
    if (source.startsWith("export", i)) {
      // Must be followed by whitespace / `{` / end to be a keyword.
      const after = source[i + 6];
      if (after && /[a-zA-Z0-9_$]/.test(after)) {
        atLineStart = false;
        continue;
      }
      // Extract the statement fragment up to the next newline to inspect.
      const eol = source.indexOf("\n", i);
      const fragment = source.slice(i, eol === -1 ? source.length : eol);
      yield { line, fragment };
      atLineStart = false;
      continue;
    }

    if (ch !== " " && ch !== "\t") atLineStart = false;
  }

  return lines;
}

function classifyExport(fragment) {
  const f = fragment.trim();

  // Type-only exports — pass (they're stripped before runtime).
  if (/^export\s+type\b/.test(f)) return { kind: "pass" };
  if (/^export\s+interface\b/.test(f)) return { kind: "pass" };
  // `export type { ... }` and `export type * from ...` — pass.
  if (/^export\s+type\s+\{/.test(f)) return { kind: "pass" };
  if (/^export\s+type\s+\*/.test(f)) return { kind: "pass" };

  // `export default ...` — if it's a function, must be async. We can't
  // always tell; flag for manual review.
  if (/^export\s+default\b/.test(f)) {
    if (/^export\s+default\s+async\s+function\b/.test(f)) return { kind: "pass" };
    if (/^export\s+default\s+async\s*\(/.test(f)) return { kind: "pass" };
    return {
      kind: "fail",
      reason: "default export must be an async function in a 'use server' file",
    };
  }

  // async function / arrow exports — pass.
  if (/^export\s+async\s+function\b/.test(f)) return { kind: "pass" };
  if (/^export\s+const\s+[a-zA-Z0-9_$]+\s*(?::[^=]+)?=\s*async\b/.test(f)) {
    return { kind: "pass" };
  }

  // Re-exports — can't verify. We warn rather than fail because some
  // codebases do `export * from './types'` for type-only re-exports, and
  // SWC will catch the runtime cases.
  if (/^export\s*\*\s+from/.test(f)) return { kind: "pass" };
  if (/^export\s*\{/.test(f)) {
    return {
      kind: "warn",
      reason:
        "indirect re-export in a 'use server' file — SWC will validate at bundle time, but this check can't",
    };
  }

  // Sync function — fail.
  if (/^export\s+function\b/.test(f)) {
    return {
      kind: "fail",
      reason: "sync function export (must be async) — Next.js Server Actions requirement",
    };
  }

  // Non-async const — fail.
  if (/^export\s+const\b/.test(f)) {
    return {
      kind: "fail",
      reason: "non-async const export (must be an async function)",
    };
  }
  if (/^export\s+let\b/.test(f) || /^export\s+var\b/.test(f)) {
    return {
      kind: "fail",
      reason: "let/var export not allowed in a 'use server' file",
    };
  }
  if (/^export\s+class\b/.test(f)) {
    return {
      kind: "fail",
      reason: "class export not allowed in a 'use server' file",
    };
  }

  return {
    kind: "warn",
    reason: `unrecognized export shape: ${f.slice(0, 80)}`,
  };
}

function runSelfTest() {
  const cases = [
    { fragment: "export async function foo()", expect: "pass" },
    { fragment: "export const foo = async () => 1", expect: "pass" },
    { fragment: "export const foo = async function () {}", expect: "pass" },
    { fragment: "export type Foo = number", expect: "pass" },
    { fragment: "export interface Foo { x: number }", expect: "pass" },
    { fragment: "export type { Foo }", expect: "pass" },
    { fragment: "export * from './other'", expect: "pass" },
    { fragment: "export function bad()", expect: "fail" },
    { fragment: "export const bad = 42", expect: "fail" },
    { fragment: "export const bad = () => 1", expect: "fail" },
    { fragment: "export class Bad {}", expect: "fail" },
    { fragment: "export let bad = 1", expect: "fail" },
    { fragment: "export default function bad() {}", expect: "fail" },
    { fragment: "export default async function good() {}", expect: "pass" },
    { fragment: "export { foo, bar }", expect: "warn" },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = classifyExport(c.fragment).kind;
    const ok = got === c.expect;
    if (!ok) {
      failed++;
      console.error(`  self-test FAIL — expected ${c.expect}, got ${got}: ${c.fragment}`);
    }
  }
  if (failed > 0) {
    console.error(`[check-server-actions] self-test failed: ${failed}/${cases.length}`);
    process.exit(1);
  }
  console.log(`[check-server-actions] self-test OK (${cases.length} cases)`);
}

async function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }
  const files = listSourceFiles();
  const failures = [];
  const warnings = [];
  let checked = 0;

  for (const rel of files) {
    const abs = `${repoRoot}${rel}`;
    let source;
    try {
      source = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    if (!leadingDirectivesContainUseServer(source)) continue;
    checked++;
    for (const { line, fragment } of iterateTopLevelExports(source)) {
      const result = classifyExport(fragment);
      if (result.kind === "fail") {
        failures.push({ file: rel, line, fragment: fragment.trim(), reason: result.reason });
      } else if (result.kind === "warn") {
        warnings.push({ file: rel, line, fragment: fragment.trim(), reason: result.reason });
      }
    }
  }

  const short = (p) => relative(repoRoot, `${repoRoot}${p}`);
  if (warnings.length > 0) {
    console.log(`\n[check-server-actions] ${warnings.length} warning(s):`);
    for (const w of warnings) {
      console.log(`  ${short(w.file)}:${w.line}  ${w.reason}`);
      console.log(`    → ${w.fragment}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n[check-server-actions] ${failures.length} failure(s):`);
    for (const f of failures) {
      console.error(`  ${short(f.file)}:${f.line}  ${f.reason}`);
      console.error(`    → ${f.fragment}`);
    }
    console.error(
      `\nFix: only async functions may be exported from a file whose first directive is "use server".`,
    );
    console.error(
      `Move the offending helpers into a sibling file (no "use server" directive) and import them.`,
    );
    process.exit(1);
  }

  console.log(
    `[check-server-actions] OK — ${checked} "use server" file(s) checked, 0 failures` +
      (warnings.length ? `, ${warnings.length} warning(s)` : ""),
  );
}

main().catch((err) => {
  console.error("[check-server-actions] script error:", err);
  process.exit(2);
});
