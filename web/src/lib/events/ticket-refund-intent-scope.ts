/**
 * What a `ticket_refund_intents` row is allowed to refund (TUL-1429 / 1431).
 *
 * The cron used to refund and void the WHOLE order line for every intent. That
 * is right for a cancelled event or a lost seat, and wrong for the two intents
 * that name ONE ticket:
 *   - `guest_request`: one holder asked; the other tickets on the line are not
 *     theirs to give back.
 *   - `admission_exchange`: one ticket moved to a cheaper night; the owed
 *     amount is the PRICE DIFFERENCE and the ticket stays valid.
 *
 * Pure, so the mapping is unit-tested without Stripe or a database. No
 * `server-only`: lane `test:events`.
 */

export type IntentRow = {
  reason: string;
  source?: string | null;
  requested_by_admission_id?: string | null;
  /** Exchange only; absent before migration 20261231416000 is applied. */
  refund_cents?: number | string | null;
};

export type IntentScope =
  /** Whole line, as before: cancelled event, lost seat. */
  | { kind: "line" }
  /** One ticket: void it and refund its share of the line. */
  | { kind: "unit"; admissionIds: string[] }
  /** Money only: refund this amount, void nothing. */
  | { kind: "amount"; amountCents: number; admissionIds: [] }
  /**
   * Cannot be executed safely. NEVER falls back to the whole line: a guessed
   * scope is how one ticket's request repaid four.
   */
  | { kind: "hold"; why: string };

export function intentRefundScope(intent: IntentRow): IntentScope {
  if (intent.reason === "guest_request") {
    const id = intent.requested_by_admission_id;
    return id ? { kind: "unit", admissionIds: [id] } : { kind: "hold", why: "guest_request_without_admission" };
  }
  if (intent.reason === "admission_exchange") {
    const cents = Number(intent.refund_cents ?? 0);
    return Number.isFinite(cents) && cents > 0
      ? { kind: "amount", amountCents: Math.trunc(cents), admissionIds: [] }
      : { kind: "hold", why: "exchange_amount_unknown" };
  }
  return { kind: "line" };
}
