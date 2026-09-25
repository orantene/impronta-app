/**
 * Money read model (audit 3.2) — pure aggregates over payment / refund /
 * payout / outstanding rows.
 *
 * Not an engine: surfaces and Today tiles call this after loading rows from
 * `booking_transactions`, order settlements, refund rows, `booking_payouts`,
 * `provider_payouts`, and booking remaining. Live loaders land in later PRs;
 * M1 ships the shape + September fixture that must match LEDGER-CONTRACT.
 *
 * Amounts are **major units** of a single currency (e.g. MXN pesos as integers),
 * matching the design ledger. Never sum across currencies.
 */

export type MoneyPaymentMethod = "card" | "cash" | "transfer";

export type MoneyPaymentRow = {
  id: string;
  /** Day of month in the fixture period (1–31), or ISO date for live rows. */
  day: number;
  clientName: string;
  forLabel: string;
  method: MoneyPaymentMethod;
  /** Platform payout id when card money rides a payout; null for outside. */
  payoutId: string | null;
  /** Major units. */
  amount: number;
  bookingId?: string | null;
  refundId?: string | null;
};

export type MoneyRefundRow = {
  id: string;
  day: number;
  ofPaymentId: string;
  clientName: string;
  amount: number;
  payoutId: string | null;
  why: string;
};

export type MoneyPayoutState = "paid" | "scheduled" | "failed";

export type MoneyPayoutRow = {
  id: string;
  day: number;
  state: MoneyPayoutState;
  /** Included payment ids (card). */
  includes: readonly string[];
  /** Gross card + carry before refunds/fees. */
  gross: number;
  refund: number;
  fees: number;
  /** Net = gross − refund − fees. */
  net: number;
  /** Estimated / not yet paid. */
  estimated?: boolean;
};

export type OutstandingScope = "overdue" | "today" | "later";

export type MoneyOutstandingRow = {
  bookingId: string;
  clientName: string;
  scope: OutstandingScope;
  agreed: number;
  paid: number;
  left: number;
};

export type MoneyLedgerInput = {
  currency: string;
  payments: readonly MoneyPaymentRow[];
  refunds: readonly MoneyRefundRow[];
  payouts: readonly MoneyPayoutRow[];
  outstanding: readonly MoneyOutstandingRow[];
};

export type MoneyByMethod = {
  card: number;
  cash: number;
  transfer: number;
};

export type MoneyLedgerSummary = {
  currency: string;
  collected_gross: number;
  payments_count: number;
  by_method: MoneyByMethod;
  recorded_outside_tulala: number;
  refunded: number;
  collected_after_refunds: number;
  outstanding_total: number;
  outstanding_overdue: number;
  outstanding_today: number;
  outstanding_later: number;
  due_by_today: number;
  platform_paid_out: number;
  next_payout_estimated: number | null;
  payouts_count: number;
  outstanding_count: number;
};

function sum(amounts: readonly number[]): number {
  return amounts.reduce((n, a) => n + a, 0);
}

function byMethodTotal(
  payments: readonly MoneyPaymentRow[],
  method: MoneyPaymentMethod,
): number {
  return sum(payments.filter((p) => p.method === method).map((p) => p.amount));
}

function outstandingSum(
  rows: readonly MoneyOutstandingRow[],
  scope?: OutstandingScope,
): number {
  return sum(
    rows
      .filter((r) => (scope ? r.scope === scope : true))
      .map((r) => r.left),
  );
}

/**
 * Aggregate Money figures from ledger rows. One currency per call.
 */
export function summarizeMoneyLedger(input: MoneyLedgerInput): MoneyLedgerSummary {
  const currency = input.currency.trim().toUpperCase();
  if (!currency) {
    throw new Error("summarizeMoneyLedger requires a currency");
  }

  const collected_gross = sum(input.payments.map((p) => p.amount));
  const by_method: MoneyByMethod = {
    card: byMethodTotal(input.payments, "card"),
    cash: byMethodTotal(input.payments, "cash"),
    transfer: byMethodTotal(input.payments, "transfer"),
  };
  const recorded_outside_tulala = by_method.cash + by_method.transfer;
  const refunded = sum(input.refunds.map((r) => r.amount));
  const outstanding_overdue = outstandingSum(input.outstanding, "overdue");
  const outstanding_today = outstandingSum(input.outstanding, "today");
  const outstanding_later = outstandingSum(input.outstanding, "later");
  const outstanding_total = outstanding_overdue + outstanding_today + outstanding_later;

  const paidPayouts = input.payouts.filter((p) => p.state === "paid");
  const platform_paid_out = sum(paidPayouts.map((p) => p.net));

  const nextScheduled = input.payouts.find(
    (p) => p.state === "scheduled" || p.estimated === true,
  );
  const next_payout_estimated = nextScheduled ? nextScheduled.net : null;

  return {
    currency,
    collected_gross,
    payments_count: input.payments.length,
    by_method,
    recorded_outside_tulala,
    refunded,
    collected_after_refunds: collected_gross - refunded,
    outstanding_total,
    outstanding_overdue,
    outstanding_today,
    outstanding_later,
    due_by_today: outstanding_overdue + outstanding_today,
    platform_paid_out,
    next_payout_estimated,
    payouts_count: input.payouts.length,
    outstanding_count: input.outstanding.length,
  };
}
