import assert from "node:assert/strict";
import { test } from "node:test";

import type { PickerTier } from "@/app/(public)/_events/ticket-picker-actions";
import {
  autoNight, checkoutTierFor, isValidEmail, nextStep, orderTotalCents, prevStep, stepQty, tierAvailability, tierFromQuery, tierMatchesRef, tierRefKind, visibleTiers,
} from "./ticket-picker-steps";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tier = (variantId: string, over: Partial<Record<string, unknown>> = {}) => ({
  variantId, label: "T", amountCents: 100000, admitsPerUnit: 1, minPerOrder: 1, maxPerOrder: null, onSale: true, saleReason: null, ageGate: null, tierKey: "t", ...over,
}) as unknown as PickerTier;

test("tierFromQuery accepts a UUID or a pool key and nothing else", () => {
  assert.equal(tierFromQuery(`?tier=${A}`), A);
  assert.equal(tierFromQuery(`?x=1&tier=${A.toUpperCase()}`), A);
  assert.equal(tierFromQuery("?tier=entrada_general"), "entrada_general");
  assert.equal(tierFromQuery("?tier=mesa_para_10"), "mesa_para_10");
  assert.equal(tierFromQuery("?tier=Lumina"), null, "a key is lower-case by the pool's own rule");
  assert.equal(tierFromQuery("?tier=../etc"), null);
  assert.equal(tierFromQuery("?tier=_leading"), null);
  assert.equal(tierFromQuery(""), null);
  assert.equal(tierFromQuery(null), null);
  assert.equal(tierRefKind(A), "id");
  assert.equal(tierRefKind("mesa_para_10"), "key");
  assert.equal(tierRefKind("no way"), null);
});

test("a tier matches a reference by id or by key", () => {
  const x = { variantId: A.toUpperCase(), tierKey: "entrada_general" };
  assert.equal(tierMatchesRef(x, A), true);
  assert.equal(tierMatchesRef(x, "entrada_general"), true);
  assert.equal(tierMatchesRef(x, "mesa_para_10"), false);
  assert.equal(tierMatchesRef(x, null), false);
});

test("a hidden tier shows only when the URL names it (by id or key); presentation merges by id", () => {
  const offered = [tier(A), tier(B, { hidden: true, tierKey: "cortesia" })];
  const pres = [{ variantId: A.toUpperCase(), includes: "Copa de vino\n\nAcceso 18:00", badge: " VIP " }];
  const plain = visibleTiers(offered, pres, null);
  assert.deepEqual(plain.map((t) => t.variantId), [A]);
  assert.deepEqual(plain[0].includes, ["Copa de vino", "Acceso 18:00"]);
  assert.equal(plain[0].badge, "VIP");
  const linked = visibleTiers(offered, pres, B);
  assert.deepEqual(linked.map((t) => t.variantId), [A, B]);
  assert.equal(linked[1].hidden, true);
  const byKey = visibleTiers(offered, pres, "cortesia");
  assert.deepEqual(byKey.map((t) => t.variantId), [A, B]);
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

test("the stepper counts from zero to the tier's minimum, up to its max, and back to zero", () => {
  const two = { minPerOrder: 2, maxPerOrder: 4 };
  assert.equal(stepQty(two, 0, 1), 2, "the first step lands on the minimum");
  assert.equal(stepQty(two, 2, 1), 3);
  assert.equal(stepQty(two, 4, 1), 4, "never past the per-order max");
  assert.equal(stepQty(two, 3, -1), 2);
  assert.equal(stepQty(two, 2, -1), 0, "below the minimum is out of the order");
  assert.equal(stepQty(two, 0, -1), 0);
  assert.equal(stepQty({ minPerOrder: 1, maxPerOrder: null }, 49, 1), 50, "no max means the engine's 50");
});

test("availability reads from the night and defaults to open", () => {
  const night = { availability: { [A]: "low" as const, [B]: "sold_out" as const } };
  assert.equal(tierAvailability(night, A), "low");
  assert.equal(tierAvailability(night, B), "sold_out");
  assert.equal(tierAvailability(night, "other"), "open");
  assert.equal(tierAvailability({ availability: undefined }, A), "open");
  assert.equal(tierAvailability(null, A), "open");
});

test("the one-tap control opens the chosen tier, else the only open one, else nothing", () => {
  const offered = [tier(A), tier(B)];
  const open = () => "open" as const;
  assert.equal(checkoutTierFor(offered, A, open)?.variantId, A);
  assert.equal(checkoutTierFor(offered, null, open), null, "two open tiers: the guest must choose");
  assert.equal(checkoutTierFor([tier(A)], null, open)?.variantId, A, "one tier: straight to checkout");
  const aSoldOut = (id: string) => (id === A ? "sold_out" as const : "open" as const);
  assert.equal(checkoutTierFor(offered, A, aSoldOut)?.variantId, B, "a sold-out choice falls through to the one open tier");
  assert.equal(checkoutTierFor([tier(A, { onSale: false })], null, open), null, "not on sale is not open");
});

test("e-mail validation is plausibility, not pedantry", () => {
  assert.equal(isValidEmail("ana@correo.mx"), true);
  assert.equal(isValidEmail("  ana@correo.mx "), true);
  assert.equal(isValidEmail("ana@correo"), false);
  assert.equal(isValidEmail("ana correo.mx"), false);
  assert.equal(isValidEmail(""), false);
});

test("total and legacy step order", () => {
  assert.equal(orderTotalCents(tier(A), 3), 300000);
  assert.equal(orderTotalCents(null, 3), 0);
  assert.equal(nextStep("tier", { askQty: true }), "qty");
  assert.equal(nextStep("tier", { askQty: false }), "details");
  assert.equal(nextStep("qty", { askQty: true }), "details");
  assert.equal(prevStep("details", { askQty: true }), "qty");
  assert.equal(prevStep("details", { askQty: false }), "tier");
  assert.equal(prevStep("qty", { askQty: true }), "tier");
});
