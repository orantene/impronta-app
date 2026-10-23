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

test("pay confirmation uses site tokens, no admin-* colour classes", () => {
  for (const [name, src] of [
    ["CheckoutView.tsx", view],
    ["pay-page.tsx", page],
  ] as const) {
    const hits = src.match(/\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline)-admin-[\w-]+/g) ?? [];
    assert.deepEqual(hits, [], `${name} paints the dashboard palette: ${hits.join(", ")}`);
  }
  assert.doesNotMatch(view, /POS_PRIMARY_ACTION|POS_SECONDARY_ACTION|POS_NOTE/);
  assert.match(view, /--token-color-ink/, "ink is the seller's token");
  assert.match(view, /--token-color-primary/, "primary action is the seller's token");
  assert.match(view, /--site-heading-font/, "headings use the seller's heading font");
  assert.match(view, /data-pay-theme="tokens"/);
});

test("paid confirmation wires .ics + Google when the page passes calendar links", () => {
  assert.match(view, /data-pay-calendar="ics"/);
  assert.match(view, /data-pay-calendar="google"/);
  assert.match(page, /icsDataHref/);
  assert.match(page, /googleCalendarUrl/);
  assert.match(page, /payCalendarEvent/);
});

/**
 * TUL-1993 history #3786 (scoped down): the open/pay amount summary gets the
 * same raised-card surface as the paid confirmation (one shared style
 * constant, both built from site tokens), and every pricing node that was
 * there before — the fee note, the service-fee row, the expiry marker — is
 * still there in the same order, just inside the card. No admin palette, no
 * reordering, no new payment logic.
 */
test("TUL-1993 history #3786: open-state amount summary reuses the paid card's token styling", () => {
  assert.match(view, /const summaryCardStyle: CSSProperties = \{/);
  // Both the open-state summary and the paid card now draw from one constant,
  // so they cannot visually drift apart again.
  const summaryUses = view.match(/style=\{summaryCardStyle\}/g) ?? [];
  const summarySpread = view.match(/\.\.\.summaryCardStyle/g) ?? [];
  assert.equal(summaryUses.length, 1, "open-state summary card");
  assert.equal(summarySpread.length, 1, "paid card spreads the same style");
  // The fields inside the open-state card kept their relative order: lines,
  // then the optional service fee, then the total, then fees/refund note.
  const openBranch = view.slice(view.indexOf("const serviceFee = Math.max"), view.indexOf("const INK ="));
  const orderedMarkers = [
    "<ol className=\"space-y-2\">",
    "data-service-fee=\"\"",
    "text-[20px] font-semibold tabular-nums",
    "data-refund-fees-note=\"\"",
  ];
  let cursor = -1;
  for (const marker of orderedMarkers) {
    const at = openBranch.indexOf(marker);
    assert.ok(at > cursor, `${marker} out of order`);
    cursor = at;
  }
  assert.doesNotMatch(summaryCardSlice(view), /\badmin-/);
});

function summaryCardSlice(src: string): string {
  const start = src.indexOf("const summaryCardStyle");
  return src.slice(start, src.indexOf("};", start) + 2);
}
