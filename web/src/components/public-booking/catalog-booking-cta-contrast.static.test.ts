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

/** E2-karla-slot-width — slot/time grid must fill the sheet, not shrink-wrap ~270px. */
test("catalog booking when-step times grid pins full sheet width", () => {
  assert.match(css, /\.jb-times\{[^}]*width:100%/);
  assert.match(css, /\.jb-body\{[^}]*width:100%/);
  assert.match(css, /\.jb-times\{grid-template-columns:repeat\(auto-fill,minmax\(104px,1fr\)\)/);
});

test("TUL-516 E6: back links stack in jb-back-nav (never inline)", () => {
  assert.match(css, /\.jb-back-nav\{[^}]*flex-direction:column/);
  assert.match(css, /\.jb-back-nav\{[^}]*gap:8px/);
  assert.match(css, /\.jb-back-link\{[^}]*display:block/);
});

test("GRK-070: disabled Continuar keeps muted ink (not white-on-edge)", () => {
  assert.match(css, /\.jb-cta:disabled\{[^}]*color:var\(--cb-muted\)/);
  assert.doesNotMatch(
    css,
    /\.jb-cta:disabled\{[^}]*color:#fff/,
    "white disabled label regresses nearly-invisible Continuar",
  );
});
