/**
 * TUL-44: the repository is PUBLIC, so no tracked script or e2e file may carry
 * a password literal. QA credentials come from env (fail loudly when unset).
 *
 * Scope: tracked code files under web/scripts and web/e2e. A line that
 * genuinely holds a throwaway value for a hermetic, local-only fixture can opt
 * out with a `secret-scan:allow` comment on the same or the previous line; say
 * why in that comment.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const ALLOW = "secret-scan:allow";

/** key = "literal" / key: "literal" / key = env ?? "literal" / env || "literal". */
const KEY = String.raw`(?:pass(?:word|wd)?|pwd|pw)\w*["']?`;
const LIT = String.raw`(["'\`])([^"'\`$\s@]{6,})\1`;
const DIRECT = new RegExp(String.raw`\b\w*${KEY}\s*[:=]\s*${LIT}`, "i");
const FALLBACK = new RegExp(String.raw`\b\w*${KEY}\s*[:=][^;]*?(?:\?\?|\|\|)\s*${LIT}`, "i");

/** Returns the line numbers (1-based) that hold a hardcoded password literal. */
export function findPasswordLiterals(source: string): number[] {
  const lines = source.split("\n");
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (line.includes(ALLOW) || (lines[i - 1] ?? "").includes(ALLOW)) return;
    const m = DIRECT.exec(line) ?? FALLBACK.exec(line);
    if (!m) return;
    const lit = m[2];
    // Field names / config keys, not secrets.
    if (/^(password|passwd|email|confirm|current|new)[-_]?(password)?$/i.test(lit)) return;
    hits.push(i + 1);
  });
  return hits;
}

test("detector flags literals and accepts env-sourced values", () => {
  assert.deepEqual(findPasswordLiterals(`const password = "Abcdef-123";`), [1]);
  assert.deepEqual(findPasswordLiterals(`{ email: x, pw: 'Abcdef-123' }`), [1]);
  assert.deepEqual(findPasswordLiterals(`const pwd = process.env.PASSWORD || "Abcdef-123";`), [1]);
  assert.deepEqual(findPasswordLiterals(`const PASSWORD = process.env.X ?? "Abcdef-123";`), [1]);
  assert.deepEqual(findPasswordLiterals(`const password = process.env.QA_PASSWORD;`), []);
  assert.deepEqual(findPasswordLiterals(`password: (process.env.X?.trim() || fail())`), []);
  assert.deepEqual(findPasswordLiterals(`password: \`\${x}-abcdefgh\``), []);
  assert.deepEqual(findPasswordLiterals(`// password: "Abcdef-123"`), []);
  assert.deepEqual(findPasswordLiterals(`// ${ALLOW}: hermetic CI db\nconst password = "Abcdef-123";`), []);
});

test("no tracked script or e2e file hardcodes a password literal", () => {
  const tracked = execFileSync("git", ["ls-files", "scripts", "e2e"], {
    cwd: WEB_ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => CODE_FILE.test(f));
  assert.ok(tracked.length > 20, "git ls-files returned too few files; guard would be vacuous");

  const offenders: string[] = [];
  for (const f of tracked) {
    for (const n of findPasswordLiterals(readFileSync(join(WEB_ROOT, f), "utf8"))) {
      offenders.push(`web/${f}:${n}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Hardcoded password literal(s) in a PUBLIC repo. Read the value from process.env and throw when unset ` +
      `(or add a justified "${ALLOW}" comment for a hermetic throwaway fixture):\n  ${offenders.join("\n  ")}`,
  );
});
