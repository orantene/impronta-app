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

/** Failed-branch destination when Fri 18 went to an old account (`mc_payout_failed`). */
export const PAYOUT_FAILED_DESTINATION = {
  bank: "BBVA ···0932",
  returnedDay: 21,
  reason: "account ···0932 is closed",
} as const;

export type PayoutAccountStateTone = "" | "ok" | "info" | "warn" | "risk";

/**
 * Design-reference cards for `mc_payout_states` (Part1 p30).
 * Amounts in Scheduled / Paid bodies are September fixture nets only.
 */
export type PayoutAccountStateCard = {
  id: string;
  chip: string;
  tone: PayoutAccountStateTone;
  body: string;
  cta: string | null;
  /** Opens payout detail when set. */
  opensPayoutId?: string;
  /** Opens failed alternate for the named payout. */
  opensFailedPayoutId?: string;
};

export const PAYOUT_ACCOUNT_STATES: readonly PayoutAccountStateCard[] = [
  {
    id: "not_connected",
    chip: "Not connected",
    tone: "",
    body: "Card payments need a payout account. Cash and transfers work without one.",
    cta: "Connect bank account",
  },
  {
    id: "setup_incomplete",
    chip: "Setup incomplete",
    tone: "warn",
    body: "2 of 4 steps done. Card payments are collected and held until it is finished.",
    cta: "Continue setup",
  },
  {
    id: "verification_required",
    chip: "Verification required",
    tone: "warn",
    body: "The processor asks for an ID photo. Payouts wait until it is checked.",
    cta: "Upload ID",
  },
  {
    id: "paused",
    chip: "Payouts paused",
    tone: "risk",
    body: "Paused by the processor on Mon 21. Reason: a document expired. Card payments still arrive.",
    cta: "See what is needed",
  },
  {
    id: "no_payout_yet",
    chip: "No payout yet",
    tone: "",
    body: "Your first card payment will be paid out on the Friday after it settles.",
    cta: null,
  },
  {
    id: "scheduled",
    chip: "Scheduled · estimated",
    tone: "info",
    body: "About $5,784 on Fri 25 Sep. Final after settling.",
    cta: "View payout",
    opensPayoutId: "PO-0925",
  },
  {
    id: "paid",
    chip: "Paid",
    tone: "ok",
    body: "$1,928 arrived Fri 18 Sep in BBVA ···4471.",
    cta: "View payout",
    opensPayoutId: "PO-0918",
  },
  {
    id: "failed",
    chip: "Failed",
    tone: "risk",
    body: "Returned by the bank: account closed. Money is back in your balance.",
    cta: "Update account",
    opensFailedPayoutId: "PO-0918",
  },
  {
    id: "could_not_load",
    chip: "Could not load",
    tone: "",
    body: "We could not reach the processor. Figures are hidden rather than shown as zero.",
    cta: "Try again",
  },
];

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
