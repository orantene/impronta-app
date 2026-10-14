import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** onb1-12: style tiles must not use lazy full-size <img> with an empty aspect box. */
test("onb1-12: StyleStep uses next/image priority + skeleton placeholder", () => {
  const src = readFileSync(new URL("./style-step.tsx", import.meta.url), "utf8");
  assert.match(src, /from "next\/image"/);
  assert.match(src, /\bpriority\b/);
  assert.match(src, /onb-style-\$\{d\}-skeleton/);
  assert.doesNotMatch(src, /loading="lazy"/);
  assert.doesNotMatch(src, /<img\b/);
});
