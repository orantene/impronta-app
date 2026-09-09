/**
 * L55 — money refunded and service cancelled are related, not one action.
 * Five effects. The UI must name the effect before confirmation.
 */

export const REFUND_EFFECTS = [
  "keep_entitlement",
  "cancel_ticket",
  "adjustment_after_service",
  "revoke_unused_admission",
  "refund_hybrid_component",
] as const;

export type RefundEffect = (typeof REFUND_EFFECTS)[number];

export type RefundEffectSpec = {
  id: RefundEffect;
  /** What happens to money. */
  money: "refund" | "optional_refund" | "none";
  /** What happens to the entitlement / admission / seat. */
  entitlement: "keep" | "revoke_one" | "none" | "revoke_component";
  releasesSeat: boolean;
};

export const REFUND_EFFECT_SPECS: Readonly<Record<RefundEffect, RefundEffectSpec>> = {
  keep_entitlement: {
    id: "keep_entitlement",
    money: "refund",
    entitlement: "keep",
    releasesSeat: false,
  },
  cancel_ticket: {
    id: "cancel_ticket",
    money: "refund",
    entitlement: "revoke_one",
    releasesSeat: true,
  },
  adjustment_after_service: {
    id: "adjustment_after_service",
    money: "refund",
    entitlement: "none",
    releasesSeat: false,
  },
  revoke_unused_admission: {
    id: "revoke_unused_admission",
    money: "optional_refund",
    entitlement: "revoke_one",
    releasesSeat: true,
  },
  refund_hybrid_component: {
    id: "refund_hybrid_component",
    money: "refund",
    entitlement: "revoke_component",
    releasesSeat: true,
  },
};

export function isRefundEffect(raw: string): raw is RefundEffect {
  return (REFUND_EFFECTS as readonly string[]).includes(raw);
}

/** `refundOrderLines` voids tickets when the line is a ticket. Map effects onto that. */
export function refundReasonForEffect(
  effect: RefundEffect,
): "service_not_delivered" | "goodwill" {
  if (effect === "keep_entitlement" || effect === "adjustment_after_service") return "goodwill";
  return "service_not_delivered";
}
