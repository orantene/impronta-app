/**
 * TUL-280: the strip's "Ver oferta" jumps to [data-guest-offer-anchor]. The v5
 * offer card (what a guest sees with Accept) must carry that anchor, not only
 * the legacy fallback bubble, or the jump finds nothing and looks dead.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dir = path.join(process.cwd(), "src/app/t/[profileCode]/_chat");
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");

test("the v5 guest offer card row carries the jump anchor", () => {
  const src = read("GuestClientCards.tsx");
  assert.match(src, /data-guest-offer-anchor/);
  assert.match(src, /offerCards\.has\(/);
});

test("the strip jump goes through the shared helper, not a bare scrollIntoView", () => {
  const src = read("ConversationStatusStrip.tsx");
  assert.match(src, /jumpToOfferAnchor/);
});

test("the legacy offer bubble no longer prints the raw engine body", () => {
  const src = read("MiniChatMessageBubble.tsx");
  assert.match(src, /offerBubbleBody/);
});
