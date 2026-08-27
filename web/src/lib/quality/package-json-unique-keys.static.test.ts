import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * JSON.parse accepts duplicate object keys — the LAST one silently wins. On
 * 2026-08-27 a merge train left `package.json` with THREE copies of
 * `test:tenant-isolation` and two of `test:builder`: every `JSON.parse`
 * "validated" the file while npm ran the last copy, which was missing three
 * merged tests (team-seat-limit, the marketing-locale-hrefs guard, and
 * no-hardcoded-copy). CI stayed green while measuring less than it claimed —
 * the exact failure mode this repo's history warns about.
 *
 * A duplicate can only appear through a bad merge resolution or a scripted
 * edit that inserts instead of replaces. Both are always mistakes here.
 */
test("package.json has no duplicate keys anywhere", () => {
  const raw = readFileSync("package.json", "utf8");

  // Walk the raw text with a tiny tokenizer: track object depth and record
  // each key at its depth+path. A real JSON parser cannot see duplicates, so
  // this deliberately does not use JSON.parse for detection.
  const seen = new Map<string, number>();
  const path: string[] = [];
  let pendingKey: string | null = null;
  const keyRe = /"((?:[^"\\]|\\.)*)"\s*:/g;
  const structural = /[{}[\]]/g;

  // Simpler and robust for this file's shape: count `"key":` occurrences per
  // enclosing object by splitting on braces at depth transitions.
  let depth = 0;
  const stack: Map<string, number>[] = [new Map()];
  let i = 0;
  let inString = false;
  let escape = false;
  let stringStart = -1;
  let lastString = "";
  let lastWasKey = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') {
        inString = false;
        lastString = raw.slice(stringStart + 1, i);
      }
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringStart = i;
    } else if (ch === ":") {
      // lastString was a key in the current object
      const scope = stack[stack.length - 1];
      const count = (scope.get(lastString) ?? 0) + 1;
      scope.set(lastString, count);
      assert.equal(
        count,
        1,
        `Duplicate key "${lastString}" in package.json — npm silently uses the last copy, dropping whatever the earlier copies carried.`,
      );
    } else if (ch === "{") {
      stack.push(new Map());
    } else if (ch === "}") {
      stack.pop();
    }
    i++;
  }
});
