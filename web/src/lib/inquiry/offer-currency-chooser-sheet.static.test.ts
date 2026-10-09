import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const rd = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("484: the Messages offer sheet asks for a currency instead of dead-ending", () => {
  const sheet = rd("../../components/messages-v5/screens/sheets/OfferEditor.tsx");

  it("the refused state offers MXN / USD for offer_currency_unresolved and drops the useless Try again", () => {
    assert.match(sheet, /refusalCode === "offer_currency_unresolved" && props\.onPickCurrency/);
    assert.match(sheet, /\["MXN", "USD"\] as const/);
    assert.match(sheet, /refusalCode !== "offer_currency_unresolved" \? \{ label: copy\.shell\.tryAgain/);
  });

  it("the pick is sent with the create call, so the engine takes the explicit currency", () => {
    assert.match(sheet, /messagingCreateOffer\(\{ inquiryId, expectedVersion: ctxNow\.version, currencyCode: pickedCurrencyRef\.current \}\)/);
    assert.match(sheet, /onPickCurrency=\{\(code\) => \{ pickedCurrencyRef\.current = code; void loadEverything\(\); \}\}/);
  });

  it("the server action already takes an optional explicit currency (no change needed there)", () => {
    assert.match(rd("../server-actions/messaging-offers.ts"), /currencyCode: z\.string\(\)\.length\(3\)\.optional\(\)/);
  });
});
