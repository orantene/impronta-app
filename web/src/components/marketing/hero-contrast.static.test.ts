import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "hero-section.tsx"), "utf8");

test("TUL-865: hero trust line and ticks stay legible over the photo", () => {
  assert.match(src, /color: "rgba\(250,247,240,0\.96\)"/);
  assert.match(src, /textShadow/);
  assert.doesNotMatch(src, /rgba\(241,237,227,0\.72\)/);
});

test("TUL-865: primary hero button is solid white with a shadow", () => {
  assert.match(src, /background: "rgb\(255 255 255\)"/);
  assert.match(src, /font-semibold[^"]*shadow-\[/);
});
