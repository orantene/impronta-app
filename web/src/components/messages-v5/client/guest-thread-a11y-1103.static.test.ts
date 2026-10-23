/**
 * TUL-1103: guest thread (/c/t) accessibility. The page needs an h1 (the
 * "Save your bookings" block is an h2), the stream announces new messages,
 * the footer button clears the 24px target, and muted ink clears AA.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(here, "ClientThreadView.tsx"), "utf8");
const css = readFileSync(join(here, "../kit/tokens.css"), "utf8");

function lum(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function ratio(fg: number, alpha: number, bg: number) {
  const blended = alpha * fg + (1 - alpha) * bg;
  const a = 0.2126 * lum(blended) + 0.7152 * lum(blended) + 0.0722 * lum(blended);
  const b = 0.2126 * lum(bg) + 0.7152 * lum(bg) + 0.0722 * lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("the business name is the page h1", () => {
  assert.match(view, /<h1>\{name\}<\/h1>/);
  assert.match(css, /\.cx-top h1\s*\{[^}]*margin: 0/);
});

test("the message stream is a polite live region", () => {
  assert.match(view, /<main className="cx-st" data-client-stream aria-live="polite" aria-relevant="additions text">/);
});

test("the footer save-to-email button has a 24px minimum target", () => {
  assert.match(css, /\.cx-foot button \{[^}]*min-height: 24px/);
});

test("the guest thread's muted ink clears 4.5:1 on the ground and on white", () => {
  const m = css.match(/\.msgv5\.cx-page \{ --msgv5-ink-3: rgba\(11, 11, 13, ([0-9.]+)\); \}/);
  assert.ok(m, "cx-page overrides ink-3");
  const alpha = Number(m[1]);
  assert.ok(ratio(11, alpha, 0xf6) >= 4.5, "ground #f6f6f3");
  assert.ok(ratio(11, alpha, 0xff) >= 4.5, "card white");
});
