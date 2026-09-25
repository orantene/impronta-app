/**
 * Pure load-path mappers (A3.1). Kept free of server-only so unit tests can
 * assert the same payment / deadline wiring `loadTalentAgenda` uses.
 */

import { deriveBookingState, derivePaymentState } from "./derive";
import type { PaymentState, TalentAgendaItem } from "./types";

export type LoadPaymentAgency = {
  payment_status?: string | null;
  payment_method?: string | null;
  balance_due_at?: string | null;
  total_client_revenue?: number | null;
  deposit_amount_cents?: number | null;
  source_type_snapshot?: string | null;
};

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
    totalCents: input.agency?.total_client_revenue ?? 0,
    paidCents: input.paidCents,
    depositCents: input.agency?.deposit_amount_cents ?? 0,
    managedByAgency: (input.agency?.source_type_snapshot ?? "").toLowerCase() === "agency",
    now: input.now,
  });
  if (
    paymentState === "none" &&
    input.linkOpen &&
    (input.agency?.payment_status ?? "unpaid") === "unpaid"
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
