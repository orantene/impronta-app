import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatImpactAmount,
  groupImpact,
  impactCount,
  impactIsConfirmable,
  impactMoneyIsAttributable,
  impactMoneyTotals,
  type Impact,
  type ImpactEffect,
} from "./model";

const money = (amountCents: number, currency = "EUR"): ImpactEffect => ({
  channel: "money",
  summary: `move ${amountCents}`,
  amountCents,
  currency,
});

const ready = (effects: readonly ImpactEffect[]): Impact => ({
  status: "ready",
  effects,
  blockers: [],
});

test("an unavailable impact is never confirmable", () => {
  assert.equal(
    impactIsConfirmable({ status: "unavailable", reason: "Could not read the pool" }),
    false,
  );
});

test("a blocker refuses the confirm even when there are real effects", () => {
  const impact: Impact = {
    status: "ready",
    effects: [money(-2500)],
    blockers: [{ summary: "The table package cannot be reserved" }],
  };
  assert.equal(impactIsConfirmable(impact), false);
});

test("an empty ready impact refuses the confirm rather than allowing a no-op", () => {
  // The failure this pins: a preview that computed nothing renders blank, the
  // operator reads blank as safe, and the button was live the whole time.
  assert.equal(impactIsConfirmable(ready([])), false);
});

test("a ready impact with effects and no blockers is confirmable", () => {
  assert.equal(impactIsConfirmable(ready([money(-2500)])), true);
});

test("groups come back in channel order regardless of insertion order", () => {
  const effects: ImpactEffect[] = [
    { channel: "message", summary: "47 emails" },
    { channel: "money", summary: "refund" },
    { channel: "promise", summary: "the guest keeps their table" },
    { channel: "allocation", summary: "47 seats released" },
  ];
  assert.deepEqual(
    groupImpact(effects).map((g) => g.channel),
    ["money", "allocation", "promise", "message"],
  );
});

test("empty channels are dropped, not rendered as headings with nothing under them", () => {
  const groups = groupImpact([{ channel: "message", summary: "one email" }]);
  assert.deepEqual(
    groups.map((g) => g.channel),
    ["message"],
  );
});

test("insertion order inside a channel survives grouping", () => {
  const groups = groupImpact([
    { channel: "money", summary: "refund the ticket" },
    { channel: "money", summary: "refund the booking fee" },
  ]);
  assert.deepEqual(
    groups[0].effects.map((e) => e.summary),
    ["refund the ticket", "refund the booking fee"],
  );
});

test("totals are per currency and never summed across", () => {
  const totals = impactMoneyTotals([money(-2500, "EUR"), money(-1000, "USD"), money(500, "EUR")]);
  assert.deepEqual(totals, [
    { currency: "EUR", amountCents: -2000 },
    { currency: "USD", amountCents: -1000 },
  ]);
});

test("currency codes are normalised so eur and EUR are one total", () => {
  const totals = impactMoneyTotals([money(-100, "eur"), money(-100, "EUR")]);
  assert.deepEqual(totals, [{ currency: "EUR", amountCents: -200 }]);
});

test("non-money effects never reach the totals", () => {
  const totals = impactMoneyTotals([
    { channel: "allocation", summary: "seats", count: 47 },
    money(-2500),
  ]);
  assert.deepEqual(totals, [{ currency: "EUR", amountCents: -2500 }]);
});

test("an amount with no currency makes the totals unattributable", () => {
  const effects: ImpactEffect[] = [
    money(-2500, "EUR"),
    { channel: "money", summary: "mystery fee", amountCents: -300 },
  ];
  // The total is still computed for the currency we DO know, but the component
  // is told it is short so it can suppress the headline rather than print
  // -€25.00 above a refund that pays out €28.00.
  assert.deepEqual(impactMoneyTotals(effects), [{ currency: "EUR", amountCents: -2500 }]);
  assert.equal(impactMoneyIsAttributable(effects), false);
});

test("a money effect with a currency and no amount does not make totals unattributable", () => {
  // "The deposit is forfeited" with no number attached is a legitimate line.
  const effects: ImpactEffect[] = [{ channel: "money", summary: "deposit forfeited", currency: "EUR" }];
  assert.equal(impactMoneyIsAttributable(effects), true);
});

test("counts sum only within their channel and only where a count was given", () => {
  const effects: ImpactEffect[] = [
    { channel: "allocation", summary: "seats", count: 40 },
    { channel: "allocation", summary: "the table itself" },
    { channel: "allocation", summary: "standing", count: 7 },
    { channel: "message", summary: "emails", count: 100 },
  ];
  // 47, not 48 — the countless line is a fact about the booking, not a unit.
  assert.equal(impactCount(effects, "allocation"), 47);
  assert.equal(impactCount(effects, "message"), 100);
  assert.equal(impactCount(effects, "money"), 0);
});

test("outbound money keeps its minus and inbound money gets an explicit plus", () => {
  assert.equal(formatImpactAmount(2500, "EUR", "en-IE"), "+€25.00");
  assert.ok(formatImpactAmount(-2500, "EUR", "en-IE").startsWith("-"));
});

test("zero is not signed as a gain", () => {
  assert.equal(formatImpactAmount(0, "EUR", "en-IE").startsWith("+"), false);
});
