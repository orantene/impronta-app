import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * GRK-046 / GRK-073 — header logo floor + side padding floor.
 *
 * Pins the token-presets contracts so a future density tweak cannot
 * shrink the mark below 32px or wipe full-bleed header gutters to 0.
 */

const CSS = fs.readFileSync(
  path.join(__dirname, "token-presets.css"),
  "utf8",
);

function flat(s: string): string {
  return s.replace(/\s+/g, " ");
}

const css = flat(CSS);

test("GRK-046: default brand-mark floor is ≥32px", () => {
  assert.match(
    css,
    /\.site-header__brand-mark \{ width: clamp\(32px, 3vw, 44px\); height: clamp\(32px, 3vw, 44px\);/,
  );
});

test("GRK-046: logo-scale sm still floors at 32px", () => {
  assert.match(
    css,
    /\.site-header\[data-logo-scale="sm"\] \.site-header__brand-mark \{ height: clamp\(32px/,
  );
});

test("GRK-073: full-bleed does not wipe site_header side padding", () => {
  assert.match(
    css,
    /\.site-header\[data-section-container="full-bleed"\] > \.site-header__inner/,
  );
  assert.match(
    css,
    /\.site-header\[data-section-container="full-bleed"\] > \.site-header__inner--freeform/,
  );
  assert.match(
    css,
    /padding-inline: clamp\(16px, 3vw, 44px\) !important/,
  );
});

test("GRK-073: mobile full-bleed keeps the same ≥16px header floor", () => {
  assert.match(
    css,
    /\.site-header\[data-section-mobile-container="full-bleed"\] > \.site-header__inner/,
  );
});
