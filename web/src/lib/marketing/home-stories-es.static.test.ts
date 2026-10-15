/** TUL-887: Spanish stories carry no English "workspace"; persona names never wrap. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ES case study block has no English 'workspace'", () => {
  const src = readFileSync("src/components/marketing/case-studies-data.ts", "utf8");
  const es = src.slice(src.indexOf("const CASE_STUDIES_ES"));
  assert.doesNotMatch(es, /workspace/i);
});

test("persona name is nowrap everywhere it renders", () => {
  const src = readFileSync("src/components/marketing/case-studies-section.tsx", "utf8");
  const uses = src.match(/\{study\.persona\}/g) ?? [];
  const nowrap = src.match(/whitespace-nowrap">\{study\.persona\}/g) ?? [];
  assert.equal(uses.length, nowrap.length);
});
