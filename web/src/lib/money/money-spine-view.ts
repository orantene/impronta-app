/**
 * Money spine view model (M2) — builds UI state from the M1 September fixture
 * and `summarizeMoneyLedger`. No alternate September totals.
 */

import {
  type MoneyLedgerSummary,
  type MoneyOutstandingRow,
  type MoneyPaymentMethod,
  type MoneyPaymentRow,
  type MoneyPayoutRow,
  type MoneyRefundRow,
  summarizeMoneyLedger,
} from "./money-read-model";
import {
  AGENCY_MONEY_LINE,
  PAYMENT_REQUEST_WAITING,
  PAYOUT_ACCOUNT,
  outstandingChromeFor,
  type OutstandingChrome,
} from "./money-spine-chrome";
import {
  formatMoneyMajor,
  formatMoneyShort,
  formatSeptemberDay,
  initialsFromName,
  methodLabel,
} from "./money-spine-format";
import { LEDGER_CONTRACT_CLOCK } from "./september-ledger-contract";
import { septemberLedgerFixture } from "./september-ledger-fixture";

export type MoneyTab = "payments" | "outstanding" | "payouts";
export type OutstandingFilter = "all" | "today" | "later";
export type MethodFilter = "all" | MoneyPaymentMethod;

export type MoneySpineView = {
  currency: string;
  tenantLabel: string;
  periodLabel: string;
  summary: MoneyLedgerSummary;
  payments: readonly MoneyPaymentRow[];
  refunds: readonly MoneyRefundRow[];
  payouts: readonly MoneyPayoutRow[];
  outstanding: readonly MoneyOutstandingRow[];
  payoutAccount: typeof PAYOUT_ACCOUNT;
  waitingRequest: typeof PAYMENT_REQUEST_WAITING;
  agencyLine: typeof AGENCY_MONEY_LINE;
};

export function buildMoneySpineView(): MoneySpineView {
  const ledger = septemberLedgerFixture();
  const summary = summarizeMoneyLedger(ledger);
  return {
    currency: ledger.currency,
    tenantLabel: LEDGER_CONTRACT_CLOCK.tenantFixture,
    periodLabel: "September 2026",
    summary,
    payments: [...ledger.payments].sort((a, b) => b.day - a.day || (a.id < b.id ? 1 : -1)),
    refunds: ledger.refunds,
    payouts: ledger.payouts,
    outstanding: ledger.outstanding,
    payoutAccount: PAYOUT_ACCOUNT,
    waitingRequest: PAYMENT_REQUEST_WAITING,
    agencyLine: AGENCY_MONEY_LINE,
  };
}

export function filterPayments(
  payments: readonly MoneyPaymentRow[],
  method: MethodFilter,
  query: string,
): MoneyPaymentRow[] {
  const q = query.trim().toLowerCase();
  return payments.filter((p) => {
    if (method !== "all" && p.method !== method) return false;
    if (!q) return true;
    return (
      p.clientName.toLowerCase().includes(q) ||
      p.forLabel.toLowerCase().includes(q)
    );
  });
}

export function filterOutstanding(
  rows: readonly MoneyOutstandingRow[],
  filt: OutstandingFilter,
): MoneyOutstandingRow[] {
  if (filt === "all") return [...rows];
  if (filt === "today") return rows.filter((r) => r.scope !== "later");
  return rows.filter((r) => r.scope === "later");
}

export function outstandingFilterTotal(
  summary: MoneyLedgerSummary,
  filt: OutstandingFilter,
): number {
  if (filt === "all") return summary.outstanding_total;
  if (filt === "today") return summary.due_by_today;
  return summary.outstanding_later;
}

export function methodCounts(payments: readonly MoneyPaymentRow[]): Record<MethodFilter, number> {
  return {
    all: payments.length,
    card: payments.filter((p) => p.method === "card").length,
    cash: payments.filter((p) => p.method === "cash").length,
    transfer: payments.filter((p) => p.method === "transfer").length,
  };
}

export function refundForPayment(
  refunds: readonly MoneyRefundRow[],
  payment: MoneyPaymentRow,
): MoneyRefundRow | null {
  if (!payment.refundId) return null;
  return refunds.find((r) => r.id === payment.refundId) ?? null;
}

export function payoutForPayment(
  payouts: readonly MoneyPayoutRow[],
  payment: MoneyPaymentRow,
): MoneyPayoutRow | null {
  if (!payment.payoutId) return null;
  return payouts.find((p) => p.id === payment.payoutId) ?? null;
}

export type PaymentDetailView = {
  payment: MoneyPaymentRow;
  refund: MoneyRefundRow | null;
  payout: MoneyPayoutRow | null;
  initials: string;
  methodLine: string;
  receivedLabel: string;
  reference: string;
  forLine: string;
  payoutLine: string | null;
  agreed: number;
  paidSoFar: number;
  remaining: number;
  priceLowered: boolean;
  history: readonly { when: string; text: string }[];
  stateChip: string;
};

export function buildPaymentDetail(
  payment: MoneyPaymentRow,
  refunds: readonly MoneyRefundRow[],
  payouts: readonly MoneyPayoutRow[],
): PaymentDetailView {
  const refund = refundForPayment(refunds, payment);
  const payout = payoutForPayment(payouts, payment);
  const agreed = refund ? payment.amount - refund.amount : payment.amount;
  const paidSoFar = agreed;
  const remaining = 0;
  const history: { when: string; text: string }[] = [
    {
      when: formatSeptemberDay(payment.day),
      text:
        payment.method === "card"
          ? `Paid ${formatMoneyShort(payment.amount)} by card · receipt emailed`
          : `You recorded ${formatMoneyShort(payment.amount)} received`,
    },
  ];
  if (refund) {
    history.push({
      when: formatSeptemberDay(refund.day),
      text: `Refund ${formatMoneyShort(refund.amount)} to the card · ${refund.why}`,
    });
    if (refund.payoutId) {
      const po = payouts.find((p) => p.id === refund.payoutId);
      const when = po ? formatSeptemberDay(po.day) : formatSeptemberDay(refund.day);
      history.push({
        when,
        text: po
          ? `Refund deducted from the Fri ${po.day} payout`
          : "Refund deducted from the payout",
      });
    }
  }

  const methodDetail =
    payment.method === "card"
      ? "Visa ···3318 · through Tulala"
      : payment.method === "cash"
        ? "Cash, recorded by you"
        : "Bank transfer, recorded by you";

  return {
    payment,
    refund,
    payout,
    initials: initialsFromName(payment.clientName),
    methodLine: methodDetail,
    receivedLabel: `${formatSeptemberDay(payment.day)}${payment.method === "card" ? " · 11:02" : ""}`,
    reference:
      payment.method === "card" ? `TUL-PAY-${payment.id}-7Q2M` : `REC-${payment.id}`,
    forLine: `${payment.forLabel} · ${formatSeptemberDay(payment.day)}`,
    payoutLine: payout
      ? `${formatSeptemberDay(payout.day)} · ${payout.estimated || payout.state === "scheduled" ? "estimated" : "paid"}`
      : null,
    agreed,
    paidSoFar,
    remaining,
    priceLowered: Boolean(refund),
    history,
    stateChip: refund
      ? "Received · partly refunded"
      : "Received",
  };
}

export function outstandingRowChrome(row: MoneyOutstandingRow): OutstandingChrome {
  return outstandingChromeFor(row.bookingId, row.scope);
}

export function payoutIncludesLabel(po: MoneyPayoutRow): string {
  const n = po.includes.length + (po.id === "PO-0904" ? 3 : 0);
  const refundBit = po.refund > 0 ? ", 1 refund" : "";
  return `${n} card payments${refundBit}, fees ${formatMoneyShort(po.fees)}`;
}

export {
  formatMoneyMajor,
  formatMoneyShort,
  formatSeptemberDay,
  initialsFromName,
  methodLabel,
};
