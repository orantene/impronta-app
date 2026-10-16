/**
 * TUL-36 phase 2 flow A carries no money: the assistant turn must never reach
 * the payment-link writer, Stripe, or the instant-book path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TURN = resolve(process.cwd(), "src/lib/ai/booking-assistant/turn.server.ts");

test("turn.server.ts imports nothing from payment, stripe or instant-book", () => {
  const src = readFileSync(TURN, "utf8");
  const importSpecs = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
  for (const spec of importSpecs) {
    assert.doesNotMatch(spec, /stripe|payment|instant-book|instant-purchase/i, spec);
  }
  assert.doesNotMatch(src, /createPaymentLink/);
});

test("turn.server.ts never places a hold or books", () => {
  const src = readFileSync(TURN, "utf8");
  assert.doesNotMatch(src, /placeReservationHold/);
  assert.doesNotMatch(src, /messagingClientPickTime/);
});

test("assistant-offered time cards carry the booking_assistant source marker", () => {
  const src = readFileSync(TURN, "utf8");
  assert.match(src, /timesPayload\(\{[\s\S]*?source: "booking_assistant",[\s\S]*?\}\)/);
});
