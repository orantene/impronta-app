import assert from "node:assert/strict";
import { test } from "node:test";

import { bookAgainRecordId, isBookAgainFulfilment } from "./guest-book-again";

test("Book again fulfilment is confirmed/fulfilled/seated/checked_in only", () => {
  assert.equal(isBookAgainFulfilment("confirmed"), true);
  assert.equal(isBookAgainFulfilment("fulfilled"), true);
  assert.equal(isBookAgainFulfilment("seated"), true);
  assert.equal(isBookAgainFulfilment("checked_in"), true);
  assert.equal(isBookAgainFulfilment("hold"), false);
  assert.equal(isBookAgainFulfilment("cancelled"), false);
  assert.equal(isBookAgainFulfilment(null), false);
});

test("bookAgainRecordId picks the first eligible chip and skips holds", () => {
  assert.equal(bookAgainRecordId(null), null);
  assert.equal(
    bookAgainRecordId([
      { kind: "order", recordId: "hold-1", paymentState: "unpaid", fulfilmentState: "hold", recordDate: null },
      { kind: "order", recordId: "paid-1", paymentState: "paid", fulfilmentState: "confirmed", recordDate: null },
    ]),
    "paid-1",
  );
});
