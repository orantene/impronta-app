/**
 * TUL-524 — site header brand name contrast lock.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { contrastRatio } from "./contrast";

const CSS = readFileSync(resolve(process.cwd(), "src/app/token-presets.css"), "utf8");

test("TUL-524: scrolled transparent header brand uses white (not gold primary)", () => {
  const block =
    /\.site-header\[data-tone="transparent"\]\[data-scrolled="true"\] \.site-header__brand[\s\S]{0,220}?color:\s*([^;]+);/;
  const m = block.exec(CSS);
  assert.ok(m, "expected scrolled transparent brand color rule");
  assert.match(m![1]!.trim(), /#fff|#ffffff/i);
});

test("TUL-524: white brand on scrolled dark chrome clears AA 4.5:1", () => {
  // Composited scrolled chrome: rgba(10,9,12,0.82) over a mid hero (#888).
  const chrome = "#2a292b"; // approx composite of 0.82 * #0a090c + 0.18 * #888
  const ratio = contrastRatio("#ffffff", chrome);
  assert.ok(ratio != null && ratio >= 4.5, `white on scrolled chrome ratio ${ratio}`);
});

test("TUL-524: brand label rule forces full opacity ink on surface/solid", () => {
  assert.match(
    CSS,
    /\.site-header\[data-tone="surface"\] \.site-header__brand-label/,
  );
  assert.match(CSS, /site-header__brand-label[^}]*opacity:\s*1/);
});

test("TUL-883: scrolled transparent header makes every control white, with a scrim and anchor offset", () => {
  assert.match(
    CSS,
    /\.site-header\[data-tone="transparent"\]\[data-scrolled="true"\] a,[\s\S]{0,400}?\{\s*color:\s*#ffffff;/,
  );
  assert.match(
    CSS,
    /\.site-header\[data-tone="transparent"\]:not\(\[data-scrolled="true"\]\)\s*\{\s*background-image:\s*linear-gradient/,
  );
  assert.match(CSS, /html:has\(\.site-header\[data-tone="transparent"\]\)\s*\{\s*scroll-padding-top:\s*84px/);
});

test("phone header: the switcher cap beats the 190px rule and the brand keeps a floor (390px crowding)", () => {
  const base = CSS.indexOf(".site-header__secsw-btn { display: inline-flex");
  const cap = CSS.indexOf(".site-header .site-header__secsw-btn { max-width: min(150px, 38vw); }");
  assert.ok(base >= 0 && cap > base, "the scoped phone cap comes after the base 190px switcher rule");
  assert.match(CSS, /\.site-header\[data-variant="freeform"\] \.site-header__region\[data-region="left"\] \{ min-width: 96px; \}/);
  assert.match(CSS, /@media \(max-width: 480px\) \{\s*\.site-header \.site-header__secsw-idx \{ display: none; \}/);
});
