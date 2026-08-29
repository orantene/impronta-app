import assert from "node:assert/strict";
import { test } from "node:test";

import { parseLooseJson } from "./parse-loose-json";

test("parses clean JSON", () => {
  assert.deepEqual(parseLooseJson<{ a: number }>('{"a":1}'), { a: 1 });
});

test("parses JSON wrapped in a markdown fence", () => {
  const out = parseLooseJson<{ summary: string }>('```json\n{"summary":"hi"}\n```');
  assert.equal(out?.summary, "hi");
});

test("parses JSON surrounded by prose", () => {
  const out = parseLooseJson<{ summary: string }>('Here you go:\n{"summary":"hi"}\nHope that helps.');
  assert.equal(out?.summary, "hi");
});

test("returns null when there is no JSON at all", () => {
  assert.equal(parseLooseJson("no json here"), null);
});
