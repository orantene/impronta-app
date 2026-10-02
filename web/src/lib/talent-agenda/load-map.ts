/**
 * Pure load-path mappers (A3.1). Kept free of server-only so unit tests can
 * assert the same payment / deadline wiring `loadTalentAgenda` uses.
 */

import { totalClientRevenueToCents } from "@/lib/money/total-client-revenue";

import { deriveBookingState, derivePaymentState } from "./derive";
import type { PaymentState, TalentAgendaItem } from "./types";

export type LoadPaymentAgency = {
  payment_status?: string | null;
  payment_method?: string | null;
  payment_notes?: string | null;
  balance_due_at?: string | null;
  total_client_revenue?: number | null;
  deposit_amount_cents?: number | null;
  source_type_snapshot?: string | null;
};

/** Written on create when the talent chose "Request payment" (collect later, no link yet). */
export const COLLECT_LATER_NOTE = "Collect later: payment request pending.";

export type LoadPaymentTx = {
  status: string;
};

/**
 * Same payment derivation as the agency_bookings loop in load.ts.
 * `payment_method=transfer` must stay awaiting after complete, not overdue.
 */
export function mapAgencyBookingPayment(input: {
  agencyStatus: string | null | undefined;
  talentBookingStatus: string;
  agency: LoadPaymentAgency | undefined;
  paidCents: number;
  latestTxStatus: string | null | undefined;
  linkOpen: boolean;
  now: Date;
  startsAt: string;
  /** Ledger stamped paid_after_cancellation — Money shows Refund pending. */
  refundPending?: boolean;
}): PaymentState {
  const bookingState = deriveBookingState({
    kind: "booking",
    status: input.agencyStatus ?? input.talentBookingStatus,
    now: input.now,
  });
  const paymentState = derivePaymentState({
    booking: bookingState,
    paymentStatus: input.agency?.payment_status,
    transactionStatus: input.latestTxStatus ?? undefined,
    checking:
      input.linkOpen &&
      (input.latestTxStatus === "pending" || input.latestTxStatus === "processing"),
    paymentMethod: input.agency?.payment_method ?? null,
    transferAwaiting: (input.agency?.payment_method ?? "").toLowerCase() === "transfer",
    startsAt: input.startsAt,
    balanceDueAt: input.agency?.balance_due_at ?? null,
    // Column is major units; payment state + UI money fields are cents.
    totalCents: totalClientRevenueToCents(input.agency?.total_client_revenue),
    paidCents: input.paidCents,
    depositCents: input.agency?.deposit_amount_cents ?? 0,
    managedByAgency: (input.agency?.source_type_snapshot ?? "").toLowerCase() === "agency",
    refundPending: input.refundPending === true,
    now: input.now,
  });
  if (
    paymentState === "none" &&
    input.linkOpen &&
    (input.agency?.payment_status ?? "unpaid") === "unpaid"
  ) {
    return "awaiting";
  }
  // "Request payment" was chosen at save time: the booking waits on a request,
  // it is not "due at the appointment" (that is the separate "due later" choice).
  if (
    (paymentState === "due" || paymentState === "none") &&
    (input.agency?.payment_status ?? "unpaid") === "unpaid" &&
    (input.agency?.payment_notes ?? "").includes(COLLECT_LATER_NOTE)
  ) {
    return "awaiting";
  }
  return paymentState;
}

export type DeliverableDeadlineRow = {
  id: string;
  booking_id: string;
  title: string;
  due_at: string;
  status: string | null;
};

/**
 * Project deadline item when `booking_deliverables.due_at` is set (A1.3 / A3.1).
 */
export function mapDeliverableDeadline(
  deliverable: DeliverableDeadlineRow,
  timeZone: string,
): TalentAgendaItem | null {
  if (!deliverable.due_at) return null;
  const due = new Date(deliverable.due_at);
  if (Number.isNaN(due.getTime())) return null;
  const dayStart = new Date(due);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(due);
  dayEnd.setHours(23, 59, 59, 999);
  return {
    id: `deadline-${deliverable.id}`,
    kind: "deadline",
    ref: { table: "booking_deliverables", id: deliverable.id },
    title: deliverable.title || "Delivery",
    lines: [],
    startsAt: dayStart.toISOString(),
    endsAt: dayEnd.toISOString(),
    allDay: true,
    tz: timeZone,
    where: { mode: "online", label: "Deadline" },
    bufferAfterMin: 0,
    booking: deliverable.status === "delivered" ? "completed" : "confirmed",
    payment: "none",
    money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" },
    source: "manual",
    blocksTime: false,
    tradeSection: { kind: "estimate", payload: { bookingId: deliverable.booking_id } },
    history: [],
  };
}
