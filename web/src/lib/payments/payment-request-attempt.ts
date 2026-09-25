/**
 * A2 / defect #14: payment-request idempotency keys must carry an attempt id.
 *
 * A stable key of only inquiry + record + amount kind made re-request after
 * expiry impossible: `createPaymentLink` looked up the expired row and
 * returned `expired`. Each intentional mint gets a fresh attempt nonce so a
 * new link can be created; retries of the *same* attempt still dedupe.
 */

/** Opaque attempt id for one mint attempt (client or server). */
export function newPaymentRequestAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Messages v5 PaymentRequest sheet key. */
export function msgv5PaymentRequestKey(input: {
  inquiryId: string;
  recordId: string;
  amountKind: string;
  attemptId: string;
}): string {
  return `msgv5-pay-${input.inquiryId}-${input.recordId}-${input.amountKind}-${input.attemptId}`;
}

/** Classic MessagesShell (v4) key. */
export function messagesShellPaymentRequestKey(input: {
  inquiryId: string;
  recordId: string;
  attemptId: string;
}): string {
  return `pay-${input.inquiryId}-${input.recordId}-${input.attemptId}`;
}

/** Agenda TaskShell pay-request composer. */
export function agendaPayRequestKey(input: {
  orderId: string;
  amountCents: number;
  attemptId: string;
}): string {
  return `agenda-pay-req-${input.orderId}-${input.amountCents}-${input.attemptId}`;
}

/** Agenda finish-card / createAgendaBookingPayLink. */
export function agendaFinishCardPayKey(input: {
  bookingId: string;
  amountCents: number;
  attemptId: string;
}): string {
  return `agenda-finish-card-${input.bookingId}-${input.amountCents}-${input.attemptId}`;
}
