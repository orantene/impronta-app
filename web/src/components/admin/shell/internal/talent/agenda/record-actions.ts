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
    cancel: act,
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
