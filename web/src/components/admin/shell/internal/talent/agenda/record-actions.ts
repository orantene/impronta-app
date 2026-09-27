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
  };
}
