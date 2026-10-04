/**
 * Talent policy answers: the only things a talent decides on the policy screen.
 * Everything else on the screen is a fact READ from its single source.
 *
 * `late_cancel_refund` is also read by the cancel engine (from the PUBLISHED
 * version), so a promise in the text is a rule in the engine. The tolerance is
 * descriptive (arrival grace), nothing enforces it.
 */

export const LATE_CANCEL_REFUNDS = ["none", "half", "full"] as const;
export type LateCancelRefund = (typeof LATE_CANCEL_REFUNDS)[number];

export type PolicyAnswers = {
  late_cancel_refund: LateCancelRefund;
  late_tolerance_min: number;
};

/** "none" is what the engine did before this feature existed. */
export const DEFAULT_POLICY_ANSWERS: PolicyAnswers = {
  late_cancel_refund: "none",
  late_tolerance_min: 15,
};

export const LATE_TOLERANCE_MAX_MIN = 120;
export const LATE_TOLERANCE_STEP_MIN = 5;

export function isLateCancelRefund(v: unknown): v is LateCancelRefund {
  return v === "none" || v === "half" || v === "full";
}

/** Tolerant parse: anything invalid falls back to the default, never throws. */
export function parsePolicyAnswers(raw: unknown): PolicyAnswers {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const tol = o.late_tolerance_min;
  return {
    late_cancel_refund: isLateCancelRefund(o.late_cancel_refund)
      ? o.late_cancel_refund
      : DEFAULT_POLICY_ANSWERS.late_cancel_refund,
    late_tolerance_min:
      typeof tol === "number" && Number.isFinite(tol) && tol >= 0 && tol <= LATE_TOLERANCE_MAX_MIN
        ? Math.round(tol)
        : DEFAULT_POLICY_ANSWERS.late_tolerance_min,
  };
}

/**
 * Cents to hand back when a client cancels INSIDE the free window.
 *  - none: the deposit is kept (0)
 *  - half: half of the deposit, rounded down to a whole cent
 *  - full: everything paid
 * `depositCents` caps the base for "half" so money paid beyond the deposit is
 * never counted as deposit; null means "what was paid is the deposit".
 */
export function lateCancelRefundCents(input: {
  mode: LateCancelRefund;
  paidCents: number;
  depositCents?: number | null;
}): number {
  const paid = Math.max(0, Math.trunc(input.paidCents));
  if (input.mode === "none") return 0;
  if (input.mode === "full") return paid;
  const deposit =
    input.depositCents == null ? paid : Math.max(0, Math.min(paid, Math.trunc(input.depositCents)));
  return Math.floor(deposit / 2);
}
