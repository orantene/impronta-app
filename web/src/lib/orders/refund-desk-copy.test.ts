import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REFUND_DESK_KEY,
  REFUND_DESK_OUTCOMES,
  refundDeskOutcome,
  refundIsRetryable,
  type RefundDeskOutcome,
} from "./refund-desk-copy";

import en from "../../../messages/en.json" with { type: "json" };
import es from "../../../messages/es.json" with { type: "json" };
import fr from "../../../messages/fr.json" with { type: "json" };

function lookup(bundle: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, bundle);
}

test("every engine refusal the desk can receive becomes a named outcome, never a code", () => {
  // The exact strings `refundOrderAtDesk`, `refundOrderLines`, `planRefund`
  // and `cancelHybridComponents` can return. Listed by hand so adding a new
  // engine refusal without a sentence breaks this test rather than shipping a
  // machine code to a cashier.
  const engineCodes = [
    "not_allowed",
    "invalid",
    "not_found",
    "wrong_tenant",
    "unavailable",
    "order_not_found",
    "line_not_on_order",
    "nothing_to_refund",
    "line_already_refunded",
    "exceeds_captured",
    "refund_refused",
    "no_provider_charge",
    "stripe_not_configured",
    "partial_failure",
    "empty",
    "not_a_component",
    "not_collected",
    "already_refunded",
    "is_a_refund",
    "amount",
  ];
  for (const code of engineCodes) {
    const outcome = refundDeskOutcome(code);
    assert.ok(
      (REFUND_DESK_OUTCOMES as readonly string[]).includes(outcome),
      `${code} produced ${outcome}, which is not an outcome`,
    );
    assert.notEqual(outcome, "refunded", `${code} is a refusal and must never read as success`);
  }
});

test("an unknown code refuses rather than being echoed or read as success", () => {
  assert.equal(refundDeskOutcome("something_new_from_an_engine"), "unavailable");
  assert.equal(refundDeskOutcome(""), "unavailable");
  assert.equal(refundDeskOutcome(null), "unavailable");
  assert.equal(refundDeskOutcome(undefined), "unavailable");
});

test("a cash sale's refusal names the off-platform case, not a generic failure", () => {
  // The whole point of the fix: `computeRefundEligibility` blocks a manual
  // collection because no Stripe charge is linked, and the operator has to be
  // told that rather than "refund_refused".
  assert.equal(refundDeskOutcome("no_provider_charge"), "no_provider_charge");
  assert.notEqual(refundDeskOutcome("no_provider_charge"), refundDeskOutcome("refund_refused"));
});

test("every outcome has a sentence in all three languages", () => {
  for (const outcome of REFUND_DESK_OUTCOMES) {
    const key = REFUND_DESK_KEY[outcome as RefundDeskOutcome];
    for (const [name, bundle] of [
      ["en", en],
      ["es", es],
      ["fr", fr],
    ] as const) {
      const value = lookup(bundle, key);
      assert.equal(typeof value, "string", `${name} is missing ${key}`);
      assert.ok((value as string).trim().length > 0, `${name} has an empty ${key}`);
      assert.ok(
        !/^[a-z_]+$/.test((value as string).trim()),
        `${name}'s ${key} is "${value}", which is a code rather than a sentence`,
      );
    }
  }
});

test("a partial failure is never offered as a retry", () => {
  assert.equal(refundIsRetryable("partial_failure"), false);
  assert.equal(refundIsRetryable("refunded"), false);
  assert.equal(refundIsRetryable("no_provider_charge"), true);
  assert.equal(refundIsRetryable("unavailable"), true);
});
