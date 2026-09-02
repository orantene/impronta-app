/**
 * Tests for the ledger writer's pure surface.
 *
 * `groupIdFor` is the whole idempotency story: if it were not deterministic, a
 * retry would write a second copy of a payment that looks exactly as legitimate
 * as the first. That is the single worst failure this system can have, so it is
 * pinned directly rather than inferred from the writer's behaviour.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { groupIdFor } from "./write";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("groupIdFor", () => {
  test("is deterministic — the same key always yields the same id", () => {
    // Without this, a retried projection double-counts.
    const a = groupIdFor("booking_payment:txn-1");
    const b = groupIdFor("booking_payment:txn-1");
    assert.equal(a, b);
  });

  test("produces a syntactically valid uuid", () => {
    // It is written into a uuid column; a malformed value fails at insert time
    // with an error that says nothing useful about the cause.
    assert.match(groupIdFor("booking_payment:txn-1"), UUID_RE);
    assert.match(groupIdFor("payout_arrived:po_123"), UUID_RE);
    assert.match(groupIdFor(""), UUID_RE);
  });

  test("different sources never collide", () => {
    const keys = [
      "booking_payment:txn-1",
      "booking_payment:txn-2",
      "processing_fee:txn-1",
      "refund:txn-1",
      "payout_initiated:po_1",
      "payout_arrived:po_1",
      "subscription_invoice:in_1",
    ];
    const ids = new Set(keys.map(groupIdFor));
    assert.equal(ids.size, keys.length, "two different sources hashed to one group");
  });

  test("the two payout phases of ONE payout are distinct groups", () => {
    // They must be separate: the money is in transit between them, and one
    // group cannot represent both without leaving the balance sheet unable to
    // show where the money actually is.
    assert.notEqual(groupIdFor("payout_initiated:po_1"), groupIdFor("payout_arrived:po_1"));
  });

  test("a payment and its processing fee are distinct groups", () => {
    // Stripe settles the fee separately; sharing a group would make our
    // stripe_balance disagree with Stripe's.
    assert.notEqual(groupIdFor("booking_payment:txn-1"), groupIdFor("processing_fee:txn-1"));
  });

  test("is stable across formatting of the same logical key", () => {
    // Guards against someone "tidying" a key later: these ARE different keys
    // and must produce different ids, so the test documents that the key string
    // is the contract, not the concept.
    assert.notEqual(groupIdFor("booking_payment:txn-1"), groupIdFor("booking_payment:TXN-1"));
  });
});
