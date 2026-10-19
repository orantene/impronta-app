import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * TUL-43 option A: the product issues no CFDI, so every payment document it
 * hands out says so instead of letting a client read it as a tax invoice.
 */
const read = (p: string) => readFileSync(p, "utf8");

test("the booking confirmation PDF says it is not a tax invoice", () => {
  assert.match(read("src/lib/payments/booking-confirmation-pdf.ts"), /not a tax invoice \(no CFDI is issued here\)/);
});

test("the receipt PDF says it is not a tax invoice", () => {
  assert.match(read("src/lib/pdf/receipt.ts"), /not a tax invoice \(no CFDI is issued here\)/);
});
