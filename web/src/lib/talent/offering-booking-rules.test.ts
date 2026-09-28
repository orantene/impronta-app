import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingRulesPatchErrors, bookingRulesRowPatch } from "./offering-booking-rules";

const priced = { title: "Cut", priceDisplay: "exact" as const, priceType: "flat_package" as const, amountCents: 5000, reserveMode: "full" as const, depositPct: null, status: "published" as const, kind: "service" as const };

test("row patch writes only the three settings columns", () => {
  const row = bookingRulesRowPatch(priced, { bookingMode: "request", depositPct: 30, cancellationHours: 24 });
  assert.deepEqual(Object.keys(row).sort(), ["booking_mode", "cancellation_hours", "deposit_pct"]);
  assert.equal(row.deposit_pct, null, "deposit stored only on a deposit reserve, like offeringToRowPatch");
  assert.equal(bookingRulesRowPatch({ reserveMode: "deposit" }, { bookingMode: null, depositPct: 30, cancellationHours: null }).deposit_pct, 30);
});

test("null means inherit and is always valid", () => {
  assert.deepEqual(bookingRulesPatchErrors(priced, { bookingMode: null, depositPct: null, cancellationHours: null }), []);
});

test("instant needs one exact price from the latest stored row", () => {
  assert.equal(bookingRulesPatchErrors({ ...priced, priceDisplay: "quote" }, { bookingMode: "instant", depositPct: null, cancellationHours: null }).length, 1);
  assert.equal(bookingRulesPatchErrors({ ...priced, amountCents: null }, { bookingMode: "instant", depositPct: null, cancellationHours: null }).length, 1);
  assert.deepEqual(bookingRulesPatchErrors(priced, { bookingMode: "instant", depositPct: null, cancellationHours: null }), []);
});

test("instant + deposit reserve needs a 1 to 99 deposit", () => {
  const dep = { ...priced, reserveMode: "deposit" as const };
  assert.equal(bookingRulesPatchErrors(dep, { bookingMode: "instant", depositPct: null, cancellationHours: null }).length, 1);
  assert.deepEqual(bookingRulesPatchErrors(dep, { bookingMode: "instant", depositPct: 25, cancellationHours: null }), []);
  assert.deepEqual(bookingRulesPatchErrors(dep, { bookingMode: "request", depositPct: null, cancellationHours: null }), []);
});

test("rejects bad numbers and unknown modes", () => {
  assert.equal(bookingRulesPatchErrors(priced, { bookingMode: null, depositPct: 150, cancellationHours: null }).length, 1);
  assert.equal(bookingRulesPatchErrors(priced, { bookingMode: null, depositPct: null, cancellationHours: -1 }).length, 1);
  assert.equal(bookingRulesPatchErrors(priced, { bookingMode: "x" as never, depositPct: null, cancellationHours: null }).length, 1);
});

test("inherited Instant default: held to instant rules with a named fix", () => {
  const none = { bookingMode: null, depositPct: null, cancellationHours: null };
  assert.deepEqual(bookingRulesPatchErrors(priced, none, "instant"), []);
  const noPrice = bookingRulesPatchErrors({ ...priced, amountCents: null }, none, "instant");
  assert.equal(noPrice.length, 1);
  assert.match(noPrice[0]!, /follows your Instant default\. Add an exact price, or set it to Request to book/);
  assert.equal(bookingRulesPatchErrors({ ...priced, priceDisplay: "quote" }, none, "instant").length, 1);
  assert.equal(bookingRulesPatchErrors({ ...priced, reserveMode: "deposit" }, none, "instant").length, 1);
  assert.deepEqual(bookingRulesPatchErrors({ ...priced, reserveMode: "deposit" }, { ...none, depositPct: 20 }, "instant"), []);
  assert.deepEqual(bookingRulesPatchErrors({ ...priced, amountCents: null }, none, "request"), [], "non-instant default: fine");
  assert.deepEqual(bookingRulesPatchErrors({ ...priced, amountCents: null, status: "draft" }, none, "instant"), [], "drafts exempt");
});
