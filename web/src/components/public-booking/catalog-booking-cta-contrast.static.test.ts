/**
 * BJ-01 — Continuar / Confirmar must use solid --token-color-primary, not the
 * pale --token-color-accent blush many vanity trees store for tints.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("./catalog-booking-styles.ts", import.meta.url), "utf8");

test("catalog booking CTA primary prefers token-color-primary over accent blush", () => {
  assert.match(css, /--cb-primary:var\(--token-color-primary/);
  // The primary assignment must not fall through accent first.
  assert.doesNotMatch(
    css,
    /--cb-primary:var\(--token-color-accent/,
    "accent-first CTA fill regresses white-on-blush Continuar",
  );
});

test("GRK-072: selected day/slot fill stays on brand primary (not ink↔surface)", () => {
  assert.match(css, /--cb-selected:var\(--token-color-primary/);
  assert.match(css, /\.jb-day\[data-on="true"\]\{[^}]*background:var\(--cb-selected\)/);
  assert.match(css, /\.jb-time\[data-on="true"\]\{[^}]*background:var\(--cb-selected\)/);
  assert.match(css, /\.jb-day\[data-on="true"\]\{[^}]*color:var\(--cb-on-selected\)/);
});
