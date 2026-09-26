/**
 * Visual-spec presentation chrome for Outstanding / waiting / agency lines.
 * Not a second September ledger — aggregates come only from M1 fixture +
 * `summarizeMoneyLedger`. These labels match Part1 p10–p12 / `mc_outstanding`.
 */

import type { OutstandingScope } from "./money-read-model";

export type OutstandingChrome = {
  bookingId: string;
  serviceLabel: string;
  /** Booking date line, e.g. "Booking Mon 21 Sep · BK-2274". */
  bookingLine: string;
  dueLine: string;
  overdue: boolean;
};

/** Per-booking copy from visual-spec / prototype `mcOwedRows`. */
export const OUTSTANDING_CHROME: Readonly<Record<string, OutstandingChrome>> = {
  "BK-2274": {
    bookingId: "BK-2274",
    serviceLabel: "Russian manicure",
    bookingLine: "Booking Mon 21 Sep · BK-2274",
    dueLine: "Due at the appointment, Mon 21 · 2 days late",
    overdue: true,
  },
  "BK-2284": {
    bookingId: "BK-2284",
    serviceLabel: "Russian volume 4D",
    bookingLine: "Booking Wed 23 Sep · BK-2284",
    dueLine: "Due today at the 11:00 appointment",
    overdue: false,
  },
  "BK-2286": {
    bookingId: "BK-2286",
    serviceLabel: "Acrylic refill",
    bookingLine: "Booking Wed 23 Sep · BK-2286",
    dueLine: "Due today at the 14:30 appointment",
    overdue: false,
  },
  "BK-2279": {
    bookingId: "BK-2279",
    serviceLabel: "Classic extensions",
    bookingLine: "Booking Thu 24 Sep · BK-2279",
    dueLine: "Due at the appointment, Thu 24",
    overdue: false,
  },
};

/** Sofía hold — payment request waiting (not owed). Visual-spec only. */
export const PAYMENT_REQUEST_WAITING = {
  clientName: "Sofía Márquez",
  initials: "SM",
  title: "deposit $300",
  detail:
    "Keeps her Fri 25 16:00 hold. Link ends with the hold at 11:40. If unpaid, nothing is owed and the time is released.",
} as const;

/** Agency line — separate from client Outstanding. Visual-spec only. */
export const AGENCY_MONEY_LINE = {
  name: "Impronta Models",
  initials: "IM",
  amount: 4500,
  detail:
    "Hand model job Sat 26. Impronta pays 30 days after the job (by Mon 26 Oct). Not counted in Outstanding from clients.",
} as const;

export const PAYOUT_ACCOUNT = {
  bank: "BBVA ···4471",
  state: "verified",
} as const;

export function outstandingChromeFor(
  bookingId: string,
  scope: OutstandingScope,
): OutstandingChrome {
  const known = OUTSTANDING_CHROME[bookingId];
  if (known) return known;
  return {
    bookingId,
    serviceLabel: "Agreed work",
    bookingLine: `Booking · ${bookingId}`,
    dueLine:
      scope === "overdue"
        ? "Overdue"
        : scope === "today"
          ? "Due today"
          : "Due later",
    overdue: scope === "overdue",
  };
}
