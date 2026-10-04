/**
 * Front-door v27 outcome cards. The panel only draws states the engine has
 * written (SHELL-REQUESTS / design brief). Classify those producer shapes into
 * the three guest-visible outcomes; never invent a card from thread status alone.
 *
 * Producers (private thread, guest-visible):
 *   - Declined: `change_result` { state: "declined", offerId | summary "Offer declined" }
 *               or `offer_state` { offerStatus: "declined" }
 *   - Pay failed: `change_result` { state: "failed", summary "Payment failed" }
 *   - Refunded: `payment_request` / `payment_paid` { state: "refunded" }
 *               or `change_result` with refundedCents and a Refunded summary
 *                 (not a cancel+refund cancel card)
 */

export type GuestOutcomeKind = "declined" | "pay_failed" | "refunded";

export type GuestOutcomeMessage = {
  readonly kind: string;
  readonly payload?: Record<string, unknown> | null;
  readonly body?: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** One engine row → outcome, or null when this row is not an outcome card. */
export function readGuestOutcome(message: GuestOutcomeMessage): GuestOutcomeKind | null {
  const kind = message.kind;
  const p = message.payload && typeof message.payload === "object" ? message.payload : {};
  const state = (str(p.state) ?? "").toLowerCase();
  const offerStatus = (str(p.offerStatus) ?? "").toLowerCase();
  const summary = (str(p.summary) ?? str(message.body) ?? "").toLowerCase();
  const refundedCents = num(p.refundedCents);

  if ((kind === "payment_request" || kind === "payment_paid") && state === "refunded") {
    return "refunded";
  }

  if (kind === "offer_state" && offerStatus === "declined") {
    return "declined";
  }

  if (kind === "change_result") {
    if (refundedCents != null && refundedCents > 0 && /^refunded\b/i.test(str(p.summary) ?? str(message.body) ?? "")) {
      return "refunded";
    }
    if (state === "failed" && (/payment/.test(summary) || summary.length === 0)) {
      return "pay_failed";
    }
    if (state === "failed") return "pay_failed";
    if (state === "declined" && (str(p.offerId) != null || /offer\s+declined/i.test(str(p.summary) ?? str(message.body) ?? ""))) {
      return "declined";
    }
  }

  return null;
}

/** Newest matching outcome in the thread wins. */
export function deriveGuestOutcomeFromMessages(
  messages: readonly GuestOutcomeMessage[],
): GuestOutcomeKind | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const outcome = readGuestOutcome(messages[i]!);
    if (outcome) return outcome;
  }
  return null;
}

/** Amount label for a refunded outcome when the engine stamped cents. */
export function readGuestOutcomeRefundAmount(message: GuestOutcomeMessage): {
  cents: number;
  currency: string;
} | null {
  if (readGuestOutcome(message) !== "refunded") return null;
  const p = message.payload && typeof message.payload === "object" ? message.payload : {};
  const cents = num(p.refundedCents) ?? num(p.paidCents) ?? num(p.amountCents);
  if (cents == null || cents <= 0) return null;
  return { cents, currency: str(p.currency) ?? "USD" };
}
