import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-1257: the phone header wordmark wraps (2-line clamp) instead of cutting to "IMPRON...".
const css = readFileSync("src/app/token-presets.css", "utf8");

test("phone brand label may wrap to two lines under 480px, in every variant that forced nowrap", () => {
  const i = css.lastIndexOf("TUL-1257");
  assert.ok(i > 0, "TUL-1257 rule present");
  const block = css.slice(i);
  assert.match(block, /@media \(max-width: 480px\)/);
  assert.match(block, /\[data-variant="standard"\] \.site-header__brand-label/);
  assert.match(block, /\[data-variant="split"\] \.site-header__brand-label/);
  assert.match(block, /white-space: normal/);
  assert.match(block, /-webkit-line-clamp: 2/);
});
