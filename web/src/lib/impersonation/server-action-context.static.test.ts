import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "../quality/supabase-unchecked-read";

/**
 * TUL-254. A server action is callable by any browser, so the effective user
 * (and the read context that carries it) must never be part of its signature.
 * The context is only ever built server-side by `effectiveReadContext` from the
 * verified cookie. This guard fails if a `"use server"` file touches
 * `lib/impersonation/effective-read` or names its context/deps types.
 */

/** True when the file's leading statements include a `"use server"` directive. */
function hasUseServerDirective(src: string): boolean {
  let rest = src;
  for (;;) {
    rest = rest.replace(/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/, "");
    const m = /^(["'])([^"'\n]*)\1\s*;?/.exec(rest);
    if (!m) return false;
    if (m[2] === "use server") return true;
    rest = rest.slice(m[0].length);
  }
}

const FORBIDDEN: Array<[string, RegExp]> = [
  ["imports lib/impersonation/effective-read", /from\s*["'][^"']*effective-read["']/],
  ["requires lib/impersonation/effective-read", /require\(\s*["'][^"']*effective-read["']\s*\)/],
  ["names EffectiveReadContext", /\bEffectiveReadContext\b/],
  ["names ReadDeps", /\b(?:Discovery)?ReadDeps\b/],
];

/** Reasons a source string breaks the rule; empty when it is fine (or not a server-action file). */
function serverActionViolations(src: string): string[] {
  if (!hasUseServerDirective(src)) return [];
  return FORBIDDEN.filter(([, re]) => re.test(src)).map(([why]) => why);
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
}

test("no server action file touches the effective read context", () => {
  const files: string[] = [];
  walk(join(WEB_ROOT, "src"), files);
  assert.ok(files.length > 500, "walk found suspiciously few files");
  let serverFiles = 0;
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    if (!hasUseServerDirective(src)) continue;
    serverFiles += 1;
    for (const why of serverActionViolations(src)) {
      bad.push(`${relative(WEB_ROOT, f)}: ${why}`);
    }
  }
  assert.ok(serverFiles > 20, `only ${serverFiles} "use server" files found; directive detection is broken`);
  assert.deepEqual(bad, [], `server actions must not accept the read context:\n${bad.join("\n")}`);
});

test("GUARD BITES: violating server-action sources are caught", () => {
  const bodies = [
    `"use server";\nimport type { EffectiveReadContext } from "@/lib/impersonation/effective-read";\nexport async function a(ctx: EffectiveReadContext) {}`,
    `'use server'\nimport { readUserId } from "../impersonation/effective-read";`,
    `// header\n/* block */\n"use server";\nexport async function a(deps: ReadDeps) {}`,
    `"use strict";\n'use server';\nexport async function a(x: EffectiveReadContext) {}`,
  ];
  for (const b of bodies) {
    assert.ok(serverActionViolations(b).length > 0, `not caught: ${b}`);
  }
});

test("GUARD PASSES: clean sources and non-action files are not flagged", () => {
  assert.deepEqual(
    serverActionViolations(`"use server";\nexport async function a(id: string) { return id; }`),
    [],
  );
  // Not a server-action file: a later string statement is not a directive.
  assert.equal(hasUseServerDirective(`import x from "y";\n"use server";`), false);
  assert.deepEqual(
    serverActionViolations(
      `import type { EffectiveReadContext } from "./effective-read";\nexport type T = EffectiveReadContext;`,
    ),
    [],
  );
  assert.equal(hasUseServerDirective(`/* c */ // d\n"use client";`), false);
});
