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
  PAYOUT_ACCOUNT_STATES,
  PAYOUT_FAILED_DESTINATION,
  outstandingChromeFor,
  type OutstandingChrome,
  type PayoutAccountStateCard,
} from "./money-spine-chrome";
import {
  formatMoneyMajor,
  formatMoneyShort,
  formatSeptemberDay,
  initialsFromName,
  methodLabel,
} from "./money-spine-format";
import {
  LEDGER_CONTRACT_AGGREGATES,
  LEDGER_CONTRACT_CLOCK,
  LEDGER_CONTRACT_RECONCILIATION,
} from "./september-ledger-contract";
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
    // Newest first — matches Part1 p16 `mc_payouts` (Fri 25 → Fri 4).
    payouts: [...ledger.payouts].sort((a, b) => b.day - a.day || (a.id < b.id ? 1 : -1)),
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

/** Unicode minus + major amount — prototype `− $120 MXN`. */
export function formatMoneyMinus(amount: number, currency = "MXN"): string {
  return `− ${formatMoneyMajor(amount, currency)}`;
}

export type PayoutLineKind = "payment" | "carry" | "refund" | "fees" | "total";

export type PayoutDetailLine = {
  kind: PayoutLineKind;
  label: string;
  amountLabel: string;
  /** Payment id when the row opens payment detail. */
  paymentId?: string;
  strong?: boolean;
};

export type PayoutDetailView = {
  payout: MoneyPayoutRow;
  failed: boolean;
  dayLabel: string;
  netLabel: string;
  stateChip: string;
  stateTone: "ok" | "info" | "risk";
  alert: { title: string; body: string } | null;
  toBank: string;
  arrivedLabel: string;
  arrivedKey: "Arrived" | "Expected";
  reference: string;
  lines: readonly PayoutDetailLine[];
  estimatedNote: string | null;
  showDownloadStatement: boolean;
};

export function buildPayoutDetail(
  payout: MoneyPayoutRow,
  payments: readonly MoneyPaymentRow[],
  refunds: readonly MoneyRefundRow[],
  opts?: { failed?: boolean },
): PayoutDetailView {
  const failed = Boolean(opts?.failed);
  const currency = "MXN";
  const included = payout.includes
    .map((id) => payments.find((p) => p.id === id))
    .filter((p): p is MoneyPaymentRow => Boolean(p))
    .sort((a, b) => a.day - b.day || (a.id < b.id ? -1 : 1));

  const includedSum = included.reduce((n, p) => n + p.amount, 0);
  const carry = Math.max(0, Math.round(payout.gross - includedSum));

  const lines: PayoutDetailLine[] = included.map((p) => ({
    kind: "payment" as const,
    label: `${p.clientName} · ${formatSeptemberDay(p.day)}`,
    amountLabel: formatMoneyMajor(p.amount, currency),
    paymentId: p.id,
  }));

  if (carry > 0) {
    const carryCount = payout.id === "PO-0904" ? 3 : 0;
    lines.push({
      kind: "carry",
      label:
        carryCount > 0
          ? `${carryCount} August card payments`
          : "Earlier card payments",
      amountLabel: formatMoneyMajor(carry, currency),
    });
  }

  if (payout.refund > 0) {
    const refund = refunds.find((r) => r.payoutId === payout.id);
    lines.push({
      kind: "refund",
      label: refund
        ? `Refund · ${refund.clientName}`
        : "Refund",
      amountLabel: formatMoneyMinus(payout.refund, currency),
    });
  }

  lines.push({
    kind: "fees",
    label: payout.estimated ? "Processor fees (estimated)" : "Processor fees",
    amountLabel: formatMoneyMinus(payout.fees, currency),
  });

  lines.push({
    kind: "total",
    label: payout.estimated ? "Estimated payout" : "Payout",
    amountLabel: formatMoneyMajor(payout.net, currency),
    strong: true,
  });

  let stateChip: string;
  let stateTone: "ok" | "info" | "risk";
  if (failed) {
    stateChip = "Failed · returned by the bank";
    stateTone = "risk";
  } else if (payout.state === "paid") {
    stateChip = "Paid";
    stateTone = "ok";
  } else if (payout.state === "failed") {
    stateChip = "Failed · returned";
    stateTone = "risk";
  } else {
    stateChip = payout.estimated ? "Scheduled · estimated" : "Scheduled";
    stateTone = "info";
  }

  const alert = failed
    ? {
        title: `BBVA returned this payout on ${formatSeptemberDay(PAYOUT_FAILED_DESTINATION.returnedDay)}.`,
        body: `Reason from the bank: ${PAYOUT_FAILED_DESTINATION.reason}. The money is back in your Tulala balance; nothing is lost.`,
      }
    : null;

  let arrivedLabel: string;
  let arrivedKey: "Arrived" | "Expected";
  if (failed) {
    arrivedKey = "Arrived";
    arrivedLabel = "Did not arrive";
  } else if (payout.estimated) {
    arrivedKey = "Expected";
    arrivedLabel = `${formatSeptemberDay(payout.day)}; your bank may take 1 business day to show it`;
  } else {
    arrivedKey = "Arrived";
    arrivedLabel = formatSeptemberDay(payout.day);
  }

  return {
    payout,
    failed,
    dayLabel: formatSeptemberDay(payout.day),
    netLabel: formatMoneyMajor(payout.net, currency),
    stateChip,
    stateTone,
    alert,
    toBank: failed ? PAYOUT_FAILED_DESTINATION.bank : PAYOUT_ACCOUNT.bank,
    arrivedLabel,
    arrivedKey,
    reference: payout.id,
    lines,
    estimatedNote: payout.estimated
      ? "Estimated: payments made through Wed 23 are still settling, and the final fee comes from the processor. Payments made today go in this payout; later ones go in the next."
      : null,
    showDownloadStatement: !failed && !payout.estimated && payout.state === "paid",
  };
}

export function payoutAccountStates(): readonly PayoutAccountStateCard[] {
  return PAYOUT_ACCOUNT_STATES;
}

/** One row on `mc_breakdown` cards. */
export type BreakdownLine = {
  label: string;
  sub?: string;
  amountLabel: string;
  strong?: boolean;
};

/** View model for Money · View breakdown (reconciliation) — Part1 p19–p21. */
export type BreakdownView = {
  currency: string;
  title: string;
  processorTitle: string;
  processorLines: readonly BreakdownLine[];
  outsideTitle: string;
  outsideLines: readonly BreakdownLine[];
  outsideFoot: string;
  collectedLines: readonly BreakdownLine[];
  whyTitle: string;
  whyBody: string;
};

/**
 * M5 reconciliation (`mc_breakdown`) — opening balance + card − refund − fees −
 * paid out = waiting for Fri 25. Cash/transfer kept apart. Numbers from
 * LEDGER-CONTRACT only.
 */
export function buildBreakdownView(): BreakdownView {
  const currency = LEDGER_CONTRACT_CLOCK.currency;
  const r = LEDGER_CONTRACT_RECONCILIATION;
  const a = LEDGER_CONTRACT_AGGREGATES;
  const ledger = septemberLedgerFixture();
  const refund = ledger.refunds[0];
  const refundSub = refund
    ? `${refund.clientName}, ${formatSeptemberDay(refund.day)}`
    : undefined;

  return {
    currency,
    title: "Breakdown · September",
    processorTitle: "Card money held by the processor, September",
    processorLines: [
      {
        label: "Waiting on 1 Sep (August card payments)",
        sub: `${r.waiting_on_1_sep_payments} payments, paid out on Fri 4 Sep`,
        amountLabel: formatMoneyMajor(r.waiting_on_1_sep, currency),
      },
      {
        label: "+ Card payments received",
        sub: `${r.card_payments} payments, 2–22 Sep`,
        amountLabel: formatMoneyMajor(r.card, currency),
      },
      {
        label: "– Refunds",
        sub: refundSub,
        amountLabel: formatMoneyMinus(r.refund, currency),
      },
      {
        label: "– Processor fees taken from payouts",
        sub: "Amounts come from the processor - fixture values",
        amountLabel: formatMoneyMinus(r.fees_placeholder, currency),
      },
      {
        label: `– Paid out to ${PAYOUT_ACCOUNT.bank}`,
        sub: "Fri 4, 11 and 18 Sep",
        amountLabel: formatMoneyMinus(r.paid_out, currency),
      },
      {
        label: "= Waiting now, goes in the Fri 25 payout",
        sub: `About ${formatMoneyShort(a.next_payout_estimated)} after an estimated ${formatMoneyShort(r.fri_25_fees_estimated)} in fees`,
        amountLabel: formatMoneyMajor(r.waiting_for_fri_25, currency),
        strong: true,
      },
    ],
    outsideTitle: "Recorded outside Tulala",
    outsideLines: [
      {
        label: "Cash",
        sub: `${r.cash_payments} payments you recorded`,
        amountLabel: formatMoneyMajor(a.by_method.cash, currency),
      },
      {
        label: "Bank transfers to you",
        sub: `${r.transfer_payments} payments you recorded`,
        amountLabel: formatMoneyMajor(a.by_method.transfer, currency),
      },
    ],
    outsideFoot: "Never part of a payout: this money is already with you.",
    collectedLines: [
      {
        label: "Collected in September (gross)",
        sub: "Card + cash + transfer",
        amountLabel: formatMoneyMajor(a.collected_gross, currency),
      },
      {
        label: "Refunded",
        amountLabel: formatMoneyMinus(a.refunded, currency),
      },
      {
        label: "Collected after refunds",
        amountLabel: formatMoneyMajor(a.collected_after_refunds, currency),
        strong: true,
      },
    ],
    whyTitle: "Why the payout is not the same as collected",
    whyBody:
      "Cash and transfers never pass through Tulala. Card money arrives on Fridays, after refunds and fees, and can belong to the previous month.",
  };
}

export {
  formatMoneyMajor,
  formatMoneyShort,
  formatSeptemberDay,
  initialsFromName,
  methodLabel,
};
