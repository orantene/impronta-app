/**
 * TUL-646: `waiting_on` once had a redundant ternary, `handledBy === "ai" ? "support" : "support"`,
 * whose two arms were the same literal (a dead branch that hid an unmade decision). It was removed
 * (#3534, proof #3823). Static guard so it cannot come back: no support-engine source file may
 * contain a ternary whose two arms are the same string literal.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const DIR = join(process.cwd(), "src", "lib", "support");

const engineFiles = (): string[] =>
  readdirSync(DIR).filter((f) => /^support-engine.*\.ts$/.test(f) && !/\.test\.ts$/.test(f)).sort();

/** `cond ? "x" : "x"` (same literal on both arms). */
const SAME_ARM_TERNARY = /\?\s*(["'`])([^"'`\n]*)\1\s*:\s*(["'`])\2\3/;
const THE_ORIGINAL = /handledBy\s*===\s*["']ai["']\s*\?\s*["']support["']\s*:\s*["']support["']/;

test("TUL-646: the support-engine sources are found", () => {
  assert.ok(engineFiles().includes("support-engine.ts"), "support-engine.ts must exist");
  assert.ok(engineFiles().includes("support-engine-append.ts"));
});

test("TUL-646: no support-engine file has the redundant waiting_on ternary", () => {
  const bad = engineFiles().filter((f) => THE_ORIGINAL.test(readFileSync(join(DIR, f), "utf8")));
  assert.deepEqual(bad, []);
});

test("TUL-646: no support-engine file has any ternary with identical string arms", () => {
  const bad = engineFiles().filter((f) => SAME_ARM_TERNARY.test(readFileSync(join(DIR, f), "utf8")));
  assert.deepEqual(bad, []);
});

test("TUL-646: guard bites (self-test of the patterns)", () => {
  assert.match(`x = handledBy === "ai" ? "support" : "support";`, THE_ORIGINAL);
  assert.match(`w = ok ? 'a' : 'a'`, SAME_ARM_TERNARY);
  assert.doesNotMatch(`w = ok ? "support" : "requester"`, SAME_ARM_TERNARY);
  assert.doesNotMatch(`w = ok ? "support" : null`, SAME_ARM_TERNARY);
});
