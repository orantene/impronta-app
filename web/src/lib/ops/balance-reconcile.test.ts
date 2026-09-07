/**
 * The reconciliation arithmetic — the one check that asks an auditor's question.
 *
 * The failure this guards against is subtle: every individual operation can
 * succeed while the totals drift apart. So the cases that matter most here are
 * the ones where a naive implementation reports agreement.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeBalanceDeltas,
  describeMismatch,
  mismatchedDeltas,
  sumStripeBalance,
} from "./balance-reconcile";

test("pending is summed WITH available — counting only available invents a phantom delta", () => {
  // A pending charge already has a balance transaction recorded against it, so
  // it is inside our sum too. Ignoring pending would report a permanent
  // mismatch the size of whatever is in flight.
  const out = sumStripeBalance({
    available: [{ amount: 10_000, currency: "usd" }],
    pending: [{ amount: 2_500, currency: "usd" }],
  });
  assert.deepEqual(out, { usd: 12_500 });
});

test("multi-currency balances stay separate", () => {
  const out = sumStripeBalance({
    available: [
      { amount: 10_000, currency: "usd" },
      { amount: 5_000, currency: "mxn" },
    ],
    pending: [{ amount: 1_000, currency: "mxn" }],
  });
  assert.deepEqual(out, { usd: 10_000, mxn: 6_000 });
});

test("currency case is normalised — USD and usd must not become two buckets", () => {
  const out = sumStripeBalance({ available: [{ amount: 100, currency: "USD" }], pending: [] });
  assert.deepEqual(out, { usd: 100 });
});

test("empty/absent buckets are zero, not a crash", () => {
  assert.deepEqual(sumStripeBalance({}), {});
  assert.deepEqual(sumStripeBalance({ available: null, pending: null }), {});
});

test("agreement yields a zero delta and no mismatch", () => {
  const deltas = computeBalanceDeltas({ usd: 12_500 }, { usd: 12_500 });
  assert.deepEqual(deltas, [{ currency: "usd", stripeCents: 12_500, oursCents: 12_500, deltaCents: 0 }]);
  assert.deepEqual(mismatchedDeltas(deltas), []);
});

test("zero on both sides agrees — the platform's state today must not alarm", () => {
  assert.deepEqual(mismatchedDeltas(computeBalanceDeltas({}, {})), []);
});

test("a currency Stripe knows and we have NEVER recorded is reported, not dropped", () => {
  // The union is the whole point. An intersection would silently skip this and
  // report agreement -- which is exactly the missed-ingest case.
  const deltas = computeBalanceDeltas({ usd: 5_000 }, {});
  assert.deepEqual(deltas, [{ currency: "usd", stripeCents: 5_000, oursCents: 0, deltaCents: 5_000 }]);
  assert.equal(mismatchedDeltas(deltas).length, 1);
});

test("a currency we recorded and Stripe does not report is also surfaced", () => {
  const deltas = computeBalanceDeltas({}, { mxn: 900 });
  assert.deepEqual(deltas, [{ currency: "mxn", stripeCents: 0, oursCents: 900, deltaCents: -900 }]);
});

test("delta sign says which way the gap runs", () => {
  // Positive = Stripe holds more than we recorded = we are MISSING transactions,
  // the common direction for a missed webhook or a truncated ingest window.
  const missing = computeBalanceDeltas({ usd: 10_000 }, { usd: 7_000 })[0];
  assert.equal(missing.deltaCents, 3_000);
  const extra = computeBalanceDeltas({ usd: 7_000 }, { usd: 10_000 })[0];
  assert.equal(extra.deltaCents, -3_000);
});

test("only mismatched currencies are alerted on", () => {
  const deltas = computeBalanceDeltas({ usd: 100, mxn: 500 }, { usd: 100, mxn: 400 });
  const bad = mismatchedDeltas(deltas);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].currency, "mxn");
});

test("the summary carries the earliest ingested date, which is what makes it actionable", () => {
  // Without it an operator cannot tell "we missed transactions" from "we
  // started counting late", and an unactionable alarm gets muted.
  const msg = describeMismatch(
    [{ currency: "usd", stripeCents: 10_000, oursCents: 7_000, deltaCents: 3_000 }],
    "2026-08-01T00:00:00.000Z",
  );
  assert.match(msg, /USD: Stripe 100\.00 vs ours 70\.00 \(delta 30\.00\)/);
  assert.match(msg, /2026-08-01/);
});

test("with nothing ingested, the summary says so plainly rather than implying a partial gap", () => {
  const msg = describeMismatch(
    [{ currency: "usd", stripeCents: 10_000, oursCents: 0, deltaCents: 10_000 }],
    null,
  );
  assert.match(msg, /ingested NO balance transactions/);
});
