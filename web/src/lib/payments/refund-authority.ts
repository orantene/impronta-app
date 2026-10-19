/**
 * TUL-1268 M6: THE refund guard. Every refund entry point asks this before any
 * money moves:
 *
 *   - refundOrderAtDesk            (admin/orders/refund-actions.ts)
 *   - refundTransactionAction      (admin/work/[id]/actions.ts)
 *   - messagingCancelRecord        (server-actions/messaging-money-actions.ts)
 *   - messagingRefund              (server-actions/messaging-money-actions.ts)
 *   - refundOwnBookingPayment      (talent-agenda/refund-actions.ts)
 *
 * The rules, in the order they are judged:
 *   1. the actor holds the refund capability for this tenant / booking,
 *   2. the amount is a positive integer of minor units (blank = the remainder,
 *      only on a surface that offers "refund everything left"),
 *   3. the amount is at most the refundable remainder (settled minus already
 *      refunded, minus non-refundable fees, as the engine computes it),
 *   4. the role limit (`enforceRoleLimit`) passes for that exact amount.
 *
 * WHY ONE MODULE. Before this, the role limit ran only at the desk, the talent
 * Money button refunded every settled charge on the order with no amount and
 * no cancelled-state check, and the desk's hybrid-component refund ignored the
 * amount the cashier typed. Each door had its own idea of "allowed". Now each
 * door answers its own two questions (who is asking, how much is left) and
 * this module decides.
 *
 * PURE apart from the injected `enforceLimit`: no database, no clock, no
 * Stripe. It never throws; a refusal is a code plus an English and a Spanish
 * sentence (`refundAuthorityMessage`).
 *
 * It does NOT change what a currently valid refund pays out: an amount inside
 * the remainder passes through unchanged, and blank still means the remainder
 * where it meant that before.
 */

import type { EnforceRoleLimitResult } from "@/lib/approvals/enforce";
import { isDeadBookingStatus } from "@/lib/money/money-rules";

export const REFUND_AUTHORITY_CODES = [
  "not_allowed",
  "invalid_amount",
  "nothing_left",
  "over_remainder",
  "over_limit",
  "unavailable",
] as const;

export type RefundAuthorityCode = (typeof REFUND_AUTHORITY_CODES)[number];

export type RefundAuthorityRefusal = {
  ok: false;
  code: RefundAuthorityCode;
  /** Set on `over_limit` when the approval request was filed. */
  requestId?: string | null;
};

export type RefundAuthorityResult = { ok: true; amountCents: number } | RefundAuthorityRefusal;

const COPY: Readonly<Record<RefundAuthorityCode, { en: string; es: string }>> = {
  not_allowed: {
    en: "You do not have permission to refund this payment.",
    es: "No tienes permiso para reembolsar este pago.",
  },
  invalid_amount: {
    en: "Enter a refund amount greater than zero.",
    es: "Escribe un monto de reembolso mayor que cero.",
  },
  nothing_left: {
    en: "There is nothing left to refund on this payment.",
    es: "No queda nada por reembolsar en este pago.",
  },
  over_remainder: {
    en: "That is more than is left to refund on this payment.",
    es: "Eso es más de lo que queda por reembolsar en este pago.",
  },
  over_limit: {
    en: "A manager with a higher limit has to make this refund.",
    es: "Un gerente con un límite mayor tiene que hacer este reembolso.",
  },
  unavailable: {
    en: "The refund could not be checked right now. Nothing was refunded. Try again.",
    es: "No se pudo verificar el reembolso en este momento. No se reembolsó nada. Inténtalo de nuevo.",
  },
};

/** The refusal sentence for a locale. Spanish for any `es*`, English otherwise. */
export function refundAuthorityMessage(code: RefundAuthorityCode, locale: string | null | undefined): string {
  const lang = (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
  return COPY[code][lang];
}

/**
 * Rules 2 and 3: the amount on its own.
 *
 * `requestedCents: null` means "the remainder" and is only accepted where
 * `allowFullRemainder` is true. A non-integer is refused, never rounded: a
 * rounded amount is not the amount the person asked for.
 */
export function checkRefundAmount(input: {
  requestedCents: number | null;
  refundableCents: number;
  allowFullRemainder: boolean;
}): RefundAuthorityResult {
  const refundable = Number.isFinite(input.refundableCents) ? Math.max(0, Math.floor(input.refundableCents)) : 0;
  if (input.requestedCents == null) {
    if (!input.allowFullRemainder) return { ok: false, code: "invalid_amount" };
    if (refundable <= 0) return { ok: false, code: "nothing_left" };
    return { ok: true, amountCents: refundable };
  }
  const asked = input.requestedCents;
  if (!Number.isFinite(asked) || !Number.isInteger(asked) || asked <= 0) {
    return { ok: false, code: "invalid_amount" };
  }
  if (refundable <= 0) return { ok: false, code: "nothing_left" };
  if (asked > refundable) return { ok: false, code: "over_remainder" };
  return { ok: true, amountCents: asked };
}

/**
 * The guard. Capability first (a stranger learns nothing about the amount),
 * then the amount, then the role limit on the amount that would actually move.
 * An impossible amount never files an approval request.
 */
export async function authorizeRefund(input: {
  capable: boolean;
  requestedCents: number | null;
  refundableCents: number;
  allowFullRemainder: boolean;
  enforceLimit: (amountCents: number) => Promise<EnforceRoleLimitResult>;
}): Promise<RefundAuthorityResult> {
  if (!input.capable) return { ok: false, code: "not_allowed" };
  const amount = checkRefundAmount(input);
  if (!amount.ok) return amount;
  let limited: EnforceRoleLimitResult;
  try {
    limited = await input.enforceLimit(amount.amountCents);
  } catch {
    return { ok: false, code: "unavailable" };
  }
  if (!limited.ok) {
    return limited.reason === "over_limit"
      ? { ok: false, code: "over_limit", requestId: limited.requestId }
      : { ok: false, code: "unavailable" };
  }
  return amount;
}

// ─── talent: their own booking ──────────────────────────────────────────────

/**
 * The talent's refund capability on a booking (on top of owning it, which
 * `requireOwnBooking` proves): the work is off (`isDeadBookingStatus`: cancelled, expired, declined...)
 * and the booking is the talent's own direct work, not an agency booking
 * (the agency holds that money and refunds it from its own desk).
 */
export function talentMayRefundOwnBooking(input: {
  status: string | null | undefined;
  sourceType: string | null | undefined;
}): boolean {
  if (!isDeadBookingStatus(input.status)) return false;
  return (input.sourceType ?? "").trim().toLowerCase() !== "agency";
}

/**
 * What the talent's refund asks for. The Money row carries the gross paid
 * after cancelling, and a charge may already be partly refunded, so a valid
 * positive ask is clamped down to what is left. Anything else (zero,
 * negative, fractional, or nothing left at all) is passed through unchanged
 * so `authorizeRefund` refuses it with the right code.
 */
export function talentRequestedCents(askedCents: number, refundableCents: number): number {
  if (!Number.isInteger(askedCents) || askedCents <= 0) return askedCents;
  if (!Number.isFinite(refundableCents) || refundableCents <= 0) return askedCents;
  return Math.min(askedCents, Math.floor(refundableCents));
}

/**
 * Spread an authorized amount over the booking's charges, oldest first, each
 * leg capped at that charge's own remainder. The legs never add up to more
 * than `amountCents`.
 */
export function planOwnBookingRefund(
  amountCents: number,
  charges: ReadonlyArray<{ transactionId: string; remainingCents: number }>,
): Array<{ transactionId: string; amountCents: number }> {
  const legs: Array<{ transactionId: string; amountCents: number }> = [];
  let left = Math.max(0, Math.floor(amountCents));
  for (const charge of charges) {
    if (left <= 0) break;
    const room = Math.max(0, Math.floor(charge.remainingCents));
    if (room <= 0) continue;
    const take = Math.min(room, left);
    legs.push({ transactionId: charge.transactionId, amountCents: take });
    left -= take;
  }
  return legs;
}
