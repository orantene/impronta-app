import assert from "node:assert/strict";
import { test } from "node:test";

import { autoNight, nextStep, orderTotalCents, prevStep, tierFromQuery, visibleTiers } from "./ticket-picker-steps";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tier = (variantId: string, over: Partial<Record<string, unknown>> = {}) => ({
  variantId, label: "T", amountCents: 100000, admitsPerUnit: 1, minPerOrder: 1, maxPerOrder: null, onSale: true, saleReason: null, ageGate: null, ...over,
}) as never;

test("tierFromQuery accepts a UUID and nothing else", () => {
  assert.equal(tierFromQuery(`?tier=${A}`), A);
  assert.equal(tierFromQuery(`?x=1&tier=${A.toUpperCase()}`), A);
  assert.equal(tierFromQuery("?tier=lumina"), null);
  assert.equal(tierFromQuery("?tier=../etc"), null);
  assert.equal(tierFromQuery(""), null);
  assert.equal(tierFromQuery(null), null);
});

test("a hidden tier shows only when the URL names it; presentation merges by id", () => {
  const offered = [tier(A), tier(B, { hidden: true })];
  const pres = [{ variantId: A.toUpperCase(), includes: "Copa de vino\n\nAcceso 18:00", badge: " VIP " }];
  const plain = visibleTiers(offered, pres, null);
  assert.deepEqual(plain.map((t) => t.variantId), [A]);
  assert.deepEqual(plain[0].includes, ["Copa de vino", "Acceso 18:00"]);
  assert.equal(plain[0].badge, "VIP");
  const linked = visibleTiers(offered, pres, B);
  assert.deepEqual(linked.map((t) => t.variantId), [A, B]);
  assert.equal(linked[1].hidden, true);
});

test("the operator can hide an on-sale tier from the cards", () => {
  const out = visibleTiers([tier(A), tier(B)], [{ variantId: B, hidden: true }], null);
  assert.deepEqual(out.map((t) => t.variantId), [A]);
});

test("one sellable night is implied in auto, never in always", () => {
  const nights = [{ sessionId: "n1", sellableVariantIds: [A] }, { sessionId: "n2", sellableVariantIds: [B] }];
  const tiers = [tier(A), tier(B, { onSale: false })];
  assert.equal(autoNight(nights, tiers, "auto"), "n1");
  assert.equal(autoNight(nights, tiers, undefined), "n1");
  assert.equal(autoNight(nights, tiers, "always"), null);
  assert.equal(autoNight(nights, [tier(A), tier(B)], "auto"), null);
});

test("total and step order", () => {
  assert.equal(orderTotalCents(tier(A), 3), 300000);
  assert.equal(orderTotalCents(null, 3), 0);
  assert.equal(nextStep("tier", { askQty: true }), "qty");
  assert.equal(nextStep("tier", { askQty: false }), "details");
  assert.equal(nextStep("qty", { askQty: true }), "details");
  assert.equal(prevStep("details", { askQty: true }), "qty");
  assert.equal(prevStep("details", { askQty: false }), "tier");
  assert.equal(prevStep("qty", { askQty: true }), "tier");
});
