import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("./MyProfilePage.tsx", import.meta.url), "utf8");

test("profile body is one grid item, not a bare fragment (QA DS-33)", () => {
  // A bare fragment inside the 2-column grid made every card its own cell.
  assert.ok(!/xl:grid-cols-\[[^\]]*\]">\s*<>/.test(src), "grid must not wrap a bare fragment");
  assert.match(src, /<div className="min-w-0">\s*<PageHeader/);
});

test("the aside always shows text, never an empty card", () => {
  assert.match(src, /previewHref \? \(\s*<a/);
  assert.match(src, /previewUnavailable/);
});

test("header subtitle drops empty parts", () => {
  assert.match(src, /\.filter\(Boolean\)\s*\.join\(" · "\)/);
});
