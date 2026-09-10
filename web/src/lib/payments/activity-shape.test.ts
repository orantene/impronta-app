import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paymentMethodKey,
  paymentMethodLabelKey,
  groupTakingsByMethod,
  sumByCurrency,
  withVariance,
} from "./activity-shape";

test("manual + cash paid_via is the cash method", () => {
  assert.equal(paymentMethodKey({ provider: "manual", paidVia: "cash" }), "cash");
});

test("manual + card paid_via is card-at-counter, not lumped with online card", () => {
  assert.equal(paymentMethodKey({ provider: "manual", paidVia: "card" }), "card_manual");
});

test("manual with no paid_via is manual_other, never guessed as cash", () => {
  assert.equal(paymentMethodKey({ provider: "manual", paidVia: null }), "manual_other");
});

test("a non-manual provider passes through unchanged — never collapsed to a generic 'card'", () => {
  assert.equal(paymentMethodKey({ provider: "stripe", paidVia: null }), "stripe");
  assert.equal(paymentMethodKey({ provider: "mercado_pago_point", paidVia: null }), "mercado_pago_point");
});

test("an unknown method has no label key, so the caller shows the raw value instead of hiding the row", () => {
  assert.equal(paymentMethodLabelKey("cash"), "methodCash");
  assert.equal(paymentMethodLabelKey("some_future_rail"), null);
});

test("takings group by BOTH currency and method — same method, two currencies, stays two rows", () => {
  const groups = groupTakingsByMethod([
    { grossAmountCents: 1000, currency: "USD", provider: "manual", paidVia: "cash" },
    { grossAmountCents: 500000, currency: "ARS", provider: "manual", paidVia: "cash" },
  ]);
  assert.equal(groups.length, 2);
  const usd = groups.find((g) => g.currency === "USD");
  const ars = groups.find((g) => g.currency === "ARS");
  assert.equal(usd?.totalCents, 1000);
  assert.equal(ars?.totalCents, 500000);
  // Regression guard: an earlier version summed across currency here and
  // returned a single 501000 bucket labelled with whichever currency came
  // first — a confidently wrong figure. Breaking this on purpose (removing
  // `currency` from the group key) reproduces exactly that bug.
});

test("takings group sums count and cents within one method+currency", () => {
  const groups = groupTakingsByMethod([
    { grossAmountCents: 1000, currency: "USD", provider: "stripe", paidVia: null },
    { grossAmountCents: 2500, currency: "USD", provider: "stripe", paidVia: null },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.totalCents, 3500);
  assert.equal(groups[0]!.count, 2);
});

test("takings group keeps cash and card-at-counter separate even in the same currency", () => {
  const groups = groupTakingsByMethod([
    { grossAmountCents: 1000, currency: "USD", provider: "manual", paidVia: "cash" },
    { grossAmountCents: 2000, currency: "USD", provider: "manual", paidVia: "card" },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.method).sort(),
    ["card_manual", "cash"],
  );
});

test("sumByCurrency never adds two currencies together", () => {
  const totals = sumByCurrency([
    { grossAmountCents: 100, currency: "usd" },
    { grossAmountCents: 200, currency: "USD" },
    { grossAmountCents: 900, currency: "ARS" },
  ]);
  assert.equal(totals.length, 2);
  const usd = totals.find((t) => t.currency === "USD");
  assert.equal(usd?.totalCents, 300, "lower-case and upper-case currency codes must fold together");
  assert.equal(usd?.count, 2);
});

test("an open shift has no variance — null, not zero, because nothing has been compared yet", () => {
  const view = withVariance({
    id: "s1",
    status: "open",
    openedAt: "2026-09-10T09:00:00Z",
    closedAt: null,
    openingCashCents: 5000,
    closingCashCents: null,
    expectedCashCents: null,
  });
  assert.equal(view.varianceCents, null);
});

test("a closed shift's variance is counted minus expected, signed", () => {
  const over = withVariance({
    id: "s2",
    status: "closed",
    openedAt: "2026-09-10T09:00:00Z",
    closedAt: "2026-09-10T17:00:00Z",
    openingCashCents: 5000,
    closingCashCents: 20500,
    expectedCashCents: 20000,
  });
  assert.equal(over.varianceCents, 500);

  const short = withVariance({
    id: "s3",
    status: "closed",
    openedAt: "2026-09-10T09:00:00Z",
    closedAt: "2026-09-10T17:00:00Z",
    openingCashCents: 5000,
    closingCashCents: 19500,
    expectedCashCents: 20000,
  });
  assert.equal(short.varianceCents, -500);
});
