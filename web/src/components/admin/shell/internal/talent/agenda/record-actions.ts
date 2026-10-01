/**
 * Pure visibility rules for the booking record's actions (P0 audit).
 *
 * - Agency-managed bookings: the agency owns the job, so the talent only gets
 *   messaging. No reschedule, cancel, no-show, deposit, finish or accept.
 * - "Finish and collect" and "Mark no-show" only after the start time.
 * - "Reschedule" only for confirmed bookings (a request is answered with
 *   "Suggest another time", not rescheduled).
 */

import type { AgendaBookingState, AgendaPaymentState } from "./types";

export type RecordActionInput = {
  canAct: boolean;
  isAgency?: boolean;
  bookingState?: AgendaBookingState;
  paymentState?: AgendaPaymentState;
  /** True once the booking's start time has passed. */
  started: boolean;
};

export type RecordActionVisibility = {
  /** False for agency jobs: hide every action except messaging. */
  talentOwnsActions: boolean;
  reschedule: boolean;
  cancel: boolean;
  noShow: boolean;
  collectDeposit: boolean;
  finishCollect: boolean;
  confirmTransfer: boolean;
  /** Completed but not settled: offer "Request payment" (AUD-017a). */
  requestPayment: boolean;
};

/** Mockup tc_more: cancel is offered on live bookings only (a request is declined). */
const CANCELLABLE = new Set<string>(["confirmed", "hold"]);

const DEPOSIT_SETTLED = new Set<string>([
  "paid",
  "paid_by_agency",
  "deposit_paid",
  "refund_pending",
]);

export function recordActionVisibility(input: RecordActionInput): RecordActionVisibility {
  const owns = !input.isAgency;
  const act = input.canAct && owns;
  const confirmed = input.bookingState === "confirmed";
  return {
    talentOwnsActions: owns,
    reschedule: act && confirmed,
    cancel: act && CANCELLABLE.has(String(input.bookingState ?? "confirmed")),
    noShow: act && confirmed,
    collectDeposit:
      act && confirmed && !DEPOSIT_SETTLED.has(String(input.paymentState ?? "")),
    finishCollect: act && confirmed && input.started,
    confirmTransfer: act,
    requestPayment: act && isCompletedUnpaid(input.bookingState, input.paymentState),
  };
}

const UNPAID = new Set<string>([
  "not_requested",
  "awaiting_deposit",
  "due_at_appointment",
  "deposit_paid",
  "overdue",
]);

export function isCompletedUnpaid(
  bookingState?: AgendaBookingState,
  paymentState?: AgendaPaymentState,
): boolean {
  return bookingState === "completed" && UNPAID.has(String(paymentState ?? "not_requested"));
}

/** "Hold ends 13:50 · 1 h 50 left" parts; null when the ISO is unusable. */
export function holdEndsParts(
  holdUntilIso: string | undefined,
  now: Date,
): { ends: string; left: string | null } | null {
  if (!holdUntilIso) return null;
  const end = new Date(holdUntilIso);
  if (Number.isNaN(end.getTime())) return null;
  const ends = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  const mins = Math.floor((end.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return { ends, left: null };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { ends, left: h > 0 ? (m > 0 ? `${h} h ${m}` : `${h} h`) : `${m} min` };
}

export const CONFIRMED_NOW_BODY = "This booking is confirmed. Mark complete after the work is done.";
export const CONFIRMED_AGENCY_NOW_BODY = "This booking is confirmed. The agency marks it complete.";

/**
 * AUD-032: agency jobs give the talent no complete action, so the confirmed
 * NOW copy must not tell them to mark it complete.
 */
export function nowBodyForRecord(body: string | undefined, isAgency?: boolean): string | undefined {
  if (isAgency && body === CONFIRMED_NOW_BODY) return CONFIRMED_AGENCY_NOW_BODY;
  return body;
}

/** Labels that name a channel or row kind, never a place (AUD-030). */
const NOT_A_PLACE = new Set(["booking", "hold", "open request", "deadline", "request"]);

/**
 * AUD-030: the record's "Where" value. Real place when known; "Online" for
 * online work; "At your studio" when the talent has a studio; otherwise
 * undefined so the row is hidden. Never a channel word like "Booking".
 */
export function placeLabelFor(
  where: { mode?: string; label?: string | null } | undefined,
  opts?: { hasStudio?: boolean },
): string | undefined {
  const label = where?.label?.trim() ?? "";
  if (label && !NOT_A_PLACE.has(label.toLowerCase())) return label;
  if (where?.mode === "online" && !label) return "Online";
  if (opts?.hasStudio) return "At your studio";
  return undefined;
}

/**
 * Mockup tc_record: the header carries Message, Reschedule and More. More is
 * hidden for agency jobs, requests and finished records (cancelled, no-show).
 */
export function showMoreMenu(input: {
  isAgency?: boolean;
  bookingState?: AgendaBookingState;
}): boolean {
  if (input.isAgency) return false;
  const s = input.bookingState ?? "confirmed";
  return s === "confirmed" || s === "hold" || s === "completed";
}

const MONEY_TAKEN = new Set<string>(["deposit_paid", "paid", "checking_payment"]);

/** True when the client has paid something that a cancel or no-show touches. */
export function clientPaidSomething(paymentState?: AgendaPaymentState): boolean {
  return MONEY_TAKEN.has(String(paymentState ?? ""));
}

export type CancelledBy = "talent" | "client";

/**
 * Mockup tc_cancel: consequences first. Copy keys (EN source strings) in the
 * order shown, money first.
 *
 * Money is read from the LEDGER (`cancelPaymentPreview`), never the chip: the
 * chip said "not paid" while a 300 MXN card payment existed, and the dialog
 * promised "No payment was taken" (QA on Jor, 2026-10-01). `ledgerPaidCents`
 * is undefined/null while the ledger has not answered; then the dialog makes
 * no claim either way. A refund is never automatic: it is done from Money.
 */
export function cancelConsequenceKeys(
  paymentState: AgendaPaymentState | undefined,
  cancelledBy: CancelledBy,
  ledgerPaidCents?: number | null,
): string[] {
  void cancelledBy;
  const rest = [
    "The time is freed on your calendar.",
    "The client sees the cancellation in your conversation.",
  ];
  const manual = "Refunds are not automatic. Refund the client by hand from Money.";
  if (typeof ledgerPaidCents !== "number") {
    return [clientPaidSomething(paymentState) ? manual : "Checking what the client paid…", ...rest];
  }
  if (ledgerPaidCents > 0) return [manual, ...rest];
  return ["No payment was taken, so there is nothing to refund. The payment link is closed.", ...rest];
}

/** Mockup tc_noshow: honest about money before recording a no-show. */
export function noShowMoneyKey(paymentState?: AgendaPaymentState): string {
  return clientPaidSomething(paymentState)
    ? "What the client paid stays as paid. Nothing is refunded automatically."
    : "Nothing was paid, so there is nothing to keep or refund.";
}
