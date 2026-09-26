"use client";

import type { AgendaPaymentState } from "../types";
import { useAgendaCopy } from "../use-agenda-copy";

const PAYMENT_STATE_META: Record<
  AgendaPaymentState,
  { labelKey: string; className: string }
> = {
  not_requested: {
    labelKey: "Not requested",
    className: "border border-[rgba(11,11,13,0.10)] bg-[rgba(11,11,13,0.05)] text-[#5F6368]",
  },
  awaiting_deposit: {
    labelKey: "Awaiting deposit",
    className: "border border-[rgba(138,90,17,0.14)] bg-[rgba(138,90,17,0.10)] text-[#8A5A11]",
  },
  checking_payment: {
    labelKey: "Checking payment",
    className: "border border-[rgba(59,76,202,0.16)] bg-[rgba(59,76,202,0.08)] text-[var(--tc-accent)]",
  },
  due_at_appointment: {
    labelKey: "Due at appointment",
    className: "border border-[rgba(59,76,202,0.16)] bg-[rgba(59,76,202,0.08)] text-[var(--tc-accent)]",
  },
  deposit_paid: {
    labelKey: "Deposit paid",
    className: "border border-[rgba(31,92,66,0.14)] bg-[rgba(31,92,66,0.10)] text-[#1F5C42]",
  },
  paid: {
    labelKey: "Paid",
    className: "border border-[rgba(31,92,66,0.14)] bg-[rgba(31,92,66,0.10)] text-[#1F5C42]",
  },
  overdue: {
    labelKey: "Overdue",
    className: "border border-[rgba(122,31,38,0.12)] bg-[rgba(176,48,58,0.10)] text-[#7A1F26]",
  },
  refund_pending: {
    labelKey: "Refund pending",
    className: "border border-[rgba(122,31,38,0.12)] bg-[rgba(176,48,58,0.10)] text-[#7A1F26]",
  },
  paid_by_agency: {
    labelKey: "Paid by agency",
    className: "border border-[rgba(11,11,13,0.10)] bg-[rgba(11,11,13,0.06)] text-[var(--tc-primary)]",
  },
};

export function PaymentStateChip({ state }: { state: AgendaPaymentState }) {
  const copy = useAgendaCopy();
  const meta = PAYMENT_STATE_META[state];
  const label = copy.t(meta.labelKey);
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${meta.className}`}
    >
      {label}
    </span>
  );
}
