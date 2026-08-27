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

  // Walk the raw text with a tiny scanner, counting `"key":` occurrences per
  // enclosing object. A JSON parser cannot see duplicates by construction —
  // it keeps the last one — so detection deliberately never calls JSON.parse.
  const stack: Map<string, number>[] = [new Map()];
  let i = 0;
  let inString = false;
  let escape = false;
  let stringStart = -1;
  let lastString = "";
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
