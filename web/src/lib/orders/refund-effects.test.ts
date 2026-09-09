import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRefundEffect,
  REFUND_EFFECT_SPECS,
  refundReasonForEffect,
} from "./refund-effects";

test("cancelling a ticket releases the seat; goodwill does not", () => {
  assert.equal(REFUND_EFFECT_SPECS.cancel_ticket.releasesSeat, true);
  assert.equal(REFUND_EFFECT_SPECS.keep_entitlement.releasesSeat, false);
  assert.equal(REFUND_EFFECT_SPECS.adjustment_after_service.releasesSeat, false);
});

test("revoking an unused admission may refund or not", () => {
  assert.equal(REFUND_EFFECT_SPECS.revoke_unused_admission.money, "optional_refund");
  assert.equal(REFUND_EFFECT_SPECS.revoke_unused_admission.releasesSeat, true);
});

test("a hybrid component refund leaves other components standing", () => {
  assert.equal(REFUND_EFFECT_SPECS.refund_hybrid_component.entitlement, "revoke_component");
});

test("unknown strings are not effects", () => {
  assert.equal(isRefundEffect("cancel_ticket"), true);
  assert.equal(isRefundEffect("void_everything"), false);
});

test("goodwill maps to a reason that does not claim non-delivery", () => {
  assert.equal(refundReasonForEffect("keep_entitlement"), "goodwill");
  assert.equal(refundReasonForEffect("cancel_ticket"), "service_not_delivered");
});
