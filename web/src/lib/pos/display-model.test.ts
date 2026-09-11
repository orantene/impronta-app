import assert from "node:assert/strict";
import { test } from "node:test";

import { displayStateFor, nextFollowedOrder, type DisplaySale } from "./display-model";

function sale(over: Partial<DisplaySale> = {}): DisplaySale {
  return { orderId: "o1", version: 3, paymentState: "unpaid", lineCount: 2, ...over };
}

test("D01: no sale, or an open sale with nothing on it, is idle", () => {
  assert.equal(displayStateFor({ sale: null, latestTransaction: null, declinedSeenAtVersion: null }), "idle");
  assert.equal(
    displayStateFor({ sale: sale({ lineCount: 0 }), latestTransaction: null, declinedSeenAtVersion: null }),
    "idle",
  );
});

test("D02: lines on an unpaid sale with no attempt in flight is the review", () => {
  assert.equal(displayStateFor({ sale: sale(), latestTransaction: null, declinedSeenAtVersion: null }), "review");
});

test("D05: a requested or pending money row, or a sale held for payment, is waiting", () => {
  for (const status of ["payment_requested", "pending"]) {
    assert.equal(
      displayStateFor({ sale: sale(), latestTransaction: { status }, declinedSeenAtVersion: null }),
      "waiting",
      status,
    );
  }
  assert.equal(
    displayStateFor({ sale: sale({ paymentState: "pending" }), latestTransaction: null, declinedSeenAtVersion: null }),
    "waiting",
  );
});

test("D07: a paid order is paid, whatever the newest money row says", () => {
  assert.equal(
    displayStateFor({ sale: sale({ paymentState: "paid" }), latestTransaction: { status: "failed" }, declinedSeenAtVersion: null }),
    "paid",
  );
});

test("a cancelled order clears the display rather than showing a stale review", () => {
  assert.equal(
    displayStateFor({ sale: sale({ paymentState: "cancelled" }), latestTransaction: null, declinedSeenAtVersion: null }),
    "idle",
  );
});

test("D06: a failed newest attempt is declined until the sale moves on", () => {
  const failed = { status: "failed" };
  assert.equal(displayStateFor({ sale: sale(), latestTransaction: failed, declinedSeenAtVersion: null }), "declined");
  // The display saw the decline at version 3; the sale is still at 3.
  assert.equal(displayStateFor({ sale: sale(), latestTransaction: failed, declinedSeenAtVersion: 3 }), "declined");
  // The cashier edited the sale (version 4): back to the review, the failed
  // row is history.
  assert.equal(
    displayStateFor({ sale: sale({ version: 4 }), latestTransaction: failed, declinedSeenAtVersion: 3 }),
    "review",
  );
  // A cancelled attempt reads the same as a failed one.
  assert.equal(
    displayStateFor({ sale: sale(), latestTransaction: { status: "cancelled" }, declinedSeenAtVersion: null }),
    "declined",
  );
});

test("a failed attempt on a sale with no lines is still idle, not declined", () => {
  assert.equal(
    displayStateFor({ sale: sale({ lineCount: 0 }), latestTransaction: { status: "failed" }, declinedSeenAtVersion: null }),
    "idle",
  );
});

test("the beacon from the counter on this device wins over the workspace's newest sale", () => {
  assert.equal(nextFollowedOrder({ beacon: "b", newestOpen: "n", finished: null }), "b");
});

test("with no beacon, the display follows the workspace's newest open sale", () => {
  assert.equal(nextFollowedOrder({ beacon: null, newestOpen: "n", finished: null }), "n");
  assert.equal(nextFollowedOrder({ beacon: null, newestOpen: null, finished: null }), null);
});

test("a sale the display has finished with is never re-adopted", () => {
  assert.equal(nextFollowedOrder({ beacon: "b", newestOpen: "n", finished: "b" }), null);
  assert.equal(nextFollowedOrder({ beacon: null, newestOpen: "n", finished: "n" }), null);
});
