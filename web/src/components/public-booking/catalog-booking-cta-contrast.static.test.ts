/**
 * BJ-01 — Continuar / Confirmar must use solid --token-color-primary, not the
 * pale --token-color-accent blush many vanity trees store for tints.
 * TUL-498 / TUL-516 — selected day/slot contrast + back-nav spacing.
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

test("TUL-498: selected day/slot uses surface ink-on (not hard white) for dark looks", () => {
  assert.match(css, /\.jb-day\[data-on="true"\]\{[^}]*color:var\(--cb-surface\)/);
  assert.match(css, /\.jb-time\[data-on="true"\]\{[^}]*color:var\(--cb-surface\)/);
  assert.doesNotMatch(css, /\.jb-day\[data-on="true"\]\{[^}]*color:#fff/);
  assert.doesNotMatch(css, /\.jb-time\[data-on="true"\]\{[^}]*color:#fff/);
});

test("TUL-516 E6: back links stack in jb-back-nav (never inline Empezar←Cambiar)", () => {
  assert.match(css, /\.jb-back-nav\{[^}]*flex-direction:column/);
  assert.match(css, /\.jb-back-nav\{[^}]*gap:8px/);
  assert.match(css, /\.jb-back-link\{[^}]*display:block/);
});
