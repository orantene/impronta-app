import assert from "node:assert/strict";
import test from "node:test";

import { jumpToOfferAnchor } from "./jump-to-offer";

type Fake = { scrolled: unknown; focused: boolean; button: { focused: boolean } | null };

function anchor(button: boolean): Fake & { scrollIntoView: (o: unknown) => void; focus: () => void; querySelector: () => unknown } {
  const a: Fake & { scrollIntoView: (o: unknown) => void; focus: () => void; querySelector: () => unknown } = {
    scrolled: null,
    focused: false,
    button: button ? { focused: false } : null,
    scrollIntoView(o) { a.scrolled = o; },
    focus() { a.focused = true; },
    querySelector() { return a.button ? { focus: () => { a.button!.focused = true; } } : null; },
  };
  return a;
}

test("TUL-280: Ver oferta scrolls the LAST offer card to the centre and focuses its action", () => {
  const first = anchor(true);
  const last = anchor(true);
  const root = { querySelectorAll: () => [first, last] };
  assert.equal(jumpToOfferAnchor(root, false), true);
  assert.equal(first.scrolled, null);
  assert.deepEqual(last.scrolled, { behavior: "smooth", block: "center" });
  assert.equal(last.button?.focused, true);
});

test("falls back to focusing the card and reports false when no card is drawn", () => {
  const only = anchor(false);
  assert.equal(jumpToOfferAnchor({ querySelectorAll: () => [only] }, true), true);
  assert.deepEqual(only.scrolled, { behavior: "auto", block: "center" });
  assert.equal(only.focused, true);
  assert.equal(jumpToOfferAnchor({ querySelectorAll: () => [] }, false), false);
  assert.equal(jumpToOfferAnchor(null, false), false);
});
