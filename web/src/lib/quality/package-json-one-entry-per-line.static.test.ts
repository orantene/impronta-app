import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Every entry in package.json "scripts" sits on its own physical line.
 *
 * On 2026-10-08 `test:money` and `test:tulala` shared one 8.8 KB physical line.
 * Git merges by line, so two PRs touching either lane collided on the same line,
 * and the hand resolutions produced glued tokens
 * ("...currency.test.ts'src/app/...") and a duplicate `test:tulala` key.
 * One entry per line makes each lane its own merge unit.
 *
 * Each line between `"scripts": {` and its closing brace must parse, on its
 * own, as exactly one `"key": "value"` entry (a trailing comma is allowed).
 */
export function scriptsLines(raw: string): string[] {
  const lines = raw.split("\n");
  const start = lines.findIndex((l) => /^ {2}"scripts": \{\s*$/.test(l));
  assert.ok(start >= 0, 'package.json has a two-space-indented `"scripts": {` line');
  const end = lines.findIndex((l, i) => i > start && /^ {2}\},?\s*$/.test(l));
  assert.ok(end > start, "the scripts object closes on its own line");
  return lines.slice(start + 1, end);
}

/** Returns the offending lines (1-based within the scripts block) for a scripts block. */
export function offenders(block: string[]): string[] {
  const bad: string[] = [];
  block.forEach((line, i) => {
    if (line.trim() === "") return;
    let keys = -1;
    try {
      keys = Object.keys(JSON.parse(`{${line.trim().replace(/,$/, "")}}`) as Record<string, unknown>).length;
    } catch {
      keys = -1;
    }
    if (keys !== 1) bad.push(`scripts line ${i + 1}: ${keys === -1 ? "not exactly one entry (does not parse alone)" : `${keys} entries`}: ${line.trim().slice(0, 80)}`);
  });
  return bad;
}

test("package.json scripts: one entry per physical line", () => {
  const found = offenders(scriptsLines(readFileSync("package.json", "utf8")));
  assert.deepEqual(found, [], "split each script onto its own line so merges stay line-local");
});

test("the check bites: two entries on one line, or an entry split across lines", () => {
  assert.equal(offenders(['    "a": "x",    "b": "y",']).length, 1);
  assert.equal(offenders(['    "a": "x",', '    "b": "y"']).length, 0);
  assert.equal(offenders(['    "a": "x \\"quoted\\", \\"k\\": 1",']).length, 0);
  assert.equal(offenders(['    "a": "x",', '    "b":', '      "y"']).length, 2);
});
