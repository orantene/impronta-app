"use client";

import type { AgendaPaymentState } from "../types";

const PAYMENT_STATE_META: Record<
  AgendaPaymentState,
  { label: string; className: string }
> = {
  not_requested: {
    label: "Not requested",
    className: "border border-[rgba(11,11,13,0.10)] bg-[rgba(11,11,13,0.05)] text-[#5F6368]",
  },
  awaiting_deposit: {
    label: "Awaiting deposit",
    className: "border border-[rgba(138,90,17,0.14)] bg-[rgba(138,90,17,0.10)] text-[#8A5A11]",
  },
  checking_payment: {
    label: "Checking payment",
    className: "border border-[rgba(59,76,202,0.16)] bg-[rgba(59,76,202,0.08)] text-[var(--tc-accent)]",
  },
  due_at_appointment: {
    label: "Due at appointment",
    className: "border border-[rgba(59,76,202,0.16)] bg-[rgba(59,76,202,0.08)] text-[var(--tc-accent)]",
  },
  deposit_paid: {
    label: "Deposit paid",
    className: "border border-[rgba(31,92,66,0.14)] bg-[rgba(31,92,66,0.10)] text-[#1F5C42]",
  },
  paid: {
    label: "Paid",
    className: "border border-[rgba(31,92,66,0.14)] bg-[rgba(31,92,66,0.10)] text-[#1F5C42]",
  },
  overdue: {
    label: "Overdue",
    className: "border border-[rgba(122,31,38,0.12)] bg-[rgba(176,48,58,0.10)] text-[#7A1F26]",
  },
  refund_pending: {
    label: "Refund pending",
    className: "border border-[rgba(122,31,38,0.12)] bg-[rgba(176,48,58,0.10)] text-[#7A1F26]",
  },
  paid_by_agency: {
    label: "Paid by agency",
    className: "border border-[rgba(11,11,13,0.10)] bg-[rgba(11,11,13,0.06)] text-[var(--tc-primary)]",
  },
};

export function PaymentStateChip({ state }: { state: AgendaPaymentState }) {
  const meta = PAYMENT_STATE_META[state];
  return (
    <span
      role="status"
      aria-label={meta.label}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
