"use client";

import { talentStatusClass } from "../../visual/tokens";
import type { AgendaPaymentState } from "../types";
import { useAgendaCopy } from "../use-agenda-copy";

const PAYMENT_STATE_META: Record<
  AgendaPaymentState,
  { labelKey: string; className: string }
> = {
  not_requested: {
    labelKey: "Deposit not requested",
    className: talentStatusClass.muted,
  },
  awaiting_deposit: {
    labelKey: "Awaiting payment",
    className: talentStatusClass.warn,
  },
  checking_payment: {
    labelKey: "Checking payment",
    className: talentStatusClass.info,
  },
  due_at_appointment: {
    labelKey: "Due at appointment",
    className: talentStatusClass.info,
  },
  deposit_paid: {
    labelKey: "Deposit paid",
    className: talentStatusClass.ok,
  },
  paid: {
    labelKey: "Paid",
    className: talentStatusClass.ok,
  },
  overdue: {
    labelKey: "Overdue",
    className: talentStatusClass.risk,
  },
  refund_pending: {
    labelKey: "Refund pending",
    className: talentStatusClass.risk,
  },
  paid_by_agency: {
    labelKey: "Paid by agency",
    className: talentStatusClass.neutral,
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
