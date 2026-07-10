/**
 * UNIT TEST — guest-conversation-prefilter.ts (W2-I).
 *
 * Pins the cheap regex gate that decides whether a guest message is worth an AI
 * extraction call. The matrix below is the contract the scan action relies on:
 * anything with a digit / currency / month / date word / quantity word is worth
 * scanning; pure chit-chat is skipped so we never pay for a model call on "ok".
 *
 * Run: npx tsx --test src/lib/inquiry/guest-conversation-prefilter.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  conversationWorthScanning,
  messageWorthScanning,
} from "./guest-conversation-prefilter";

describe("guest-conversation prefilter — trigger words vs chit-chat", () => {
  it("SCANS messages that carry a booking detail", () => {
    const worth = [
      "We need 40 people for the party", // quantity + digit
      "Budget is around $5000", // currency symbol + digit
      "around 3000 EUR total", // currency code + digit
      "The wedding is on June 12th", // month + digit
      "Can you do next Friday?", // date word
      "Looking for 2 models", // quantity + digit
      "Sometime this weekend works", // date word
      "12 guests, evening event", // digit + quantity
      "we have a budget of two thousand dollars", // currency code, no digit
      "prefer a saturday", // weekday
    ];
    for (const m of worth) {
      assert.equal(messageWorthScanning(m), true, `should scan: ${m}`);
    }
  });

  it("SKIPS pure chit-chat with no extractable detail", () => {
    const skip = [
      "thanks!",
      "ok",
      "sounds good",
      "great, talk soon",
      "hi there",
      "yes please",
      "awesome, thank you so much",
      "no worries",
      "", // empty
      "   ", // whitespace only
    ];
    for (const m of skip) {
      assert.equal(messageWorthScanning(m), false, `should skip: ${m}`);
    }
  });

  it("returns false for null / undefined without throwing", () => {
    assert.equal(messageWorthScanning(null), false);
    assert.equal(messageWorthScanning(undefined), false);
  });

  it("does not false-trigger on words that merely CONTAIN a trigger substring", () => {
    // "person" matches quantity, but these should NOT: guard against substring
    // bleed via word boundaries.
    assert.equal(messageWorthScanning("personally I loved it"), false); // "personally" not "person"
    assert.equal(messageWorthScanning("that was marvelous"), false); // "marvelous" not a month
    assert.equal(messageWorthScanning("sunny day vibes"), false); // "sun" but not "sun(day)"
  });

  it("conversationWorthScanning is true when ANY message qualifies", () => {
    assert.equal(
      conversationWorthScanning(["hi", "thanks", "we need 20 people"]),
      true,
    );
    assert.equal(conversationWorthScanning(["hi", "ok", "thanks!"]), false);
    assert.equal(conversationWorthScanning([]), false);
    assert.equal(conversationWorthScanning([null, undefined, "  "]), false);
  });
});
