import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveOfferingCta, blankOffering } from "./offerings-types";
import { quoteNeedsPriceReminder, toFixedMode, toQuoteMode } from "./offering-price-mode";

const o = blankOffering("tp", "USD", 0);

test("TUL-633: Get a quote publishes the Request a quote button, Fixed price restores booking", () => {
  const q = { ...o, ...toQuoteMode(), amountCents: null };
  assert.equal(resolveOfferingCta(q), "ask_quote");
  assert.equal(q.bookingMode, "request");
  const f = { ...q, ...toFixedMode(), amountCents: 5000, bookingMode: "instant" as const };
  assert.equal(resolveOfferingCta(f), "book_now");
  assert.equal(toFixedMode().bookingMode, null);
});

test("TUL-633: the price reminder shows only for a live quote service", () => {
  assert.equal(quoteNeedsPriceReminder({ status: "published", priceDisplay: "quote" }), true);
  assert.equal(quoteNeedsPriceReminder({ status: "draft", priceDisplay: "quote" }), false);
  assert.equal(quoteNeedsPriceReminder({ status: "published", priceDisplay: "exact" }), false);
});
