/**
 * TUL-437: the pay return page wears the seller's site tokens, never the
 * dashboard palette. Run: node_modules/.bin/tsx --test src/lib/payments/pay-theme.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const DIR = join(process.cwd(), "src/app/(public)/pay/[code]");
const view = readFileSync(join(DIR, "CheckoutView.tsx"), "utf8");
const page = readFileSync(join(DIR, "pay-page.tsx"), "utf8");
const parts = readFileSync(join(DIR, "PayParts.tsx"), "utf8");

test("pay confirmation uses site tokens, no admin-* colour classes", () => {
  for (const [name, src] of [
    ["CheckoutView.tsx", view],
    ["pay-page.tsx", page],
    ["PayParts.tsx", parts],
  ] as const) {
    const hits = src.match(/\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline)-admin-[\w-]+/g) ?? [];
    assert.deepEqual(hits, [], `${name} paints the dashboard palette: ${hits.join(", ")}`);
  }
  assert.doesNotMatch(view, /POS_PRIMARY_ACTION|POS_SECONDARY_ACTION|POS_NOTE/);
  assert.match(parts, /--token-color-ink/, "ink is the seller's token");
  assert.match(parts, /--token-color-primary/, "primary action is the seller's token");
  assert.match(parts, /--site-heading-font/, "headings use the seller's heading font");
  assert.match(parts, /data-pay-theme="tokens"/);
});

test("paid confirmation wires .ics + Google when the page passes calendar links", () => {
  assert.match(view, /data-pay-calendar="ics"/);
  assert.match(view, /data-pay-calendar="google"/);
  assert.match(page, /icsDataHref/);
  assert.match(page, /googleCalendarUrl/);
  assert.match(page, /payCalendarEvent/);
});
