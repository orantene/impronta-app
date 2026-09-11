"use client";

/**
 * PaidScreen — M13, the shared success state as the counter shows it: the
 * amount, the change, the receipt actions, and one clear "Next customer"
 * action. Every product journey in the program funnels through the same
 * shared payment states (money.md §1); this is the counter's rendering of
 * that one shared state, not a counter-specific success screen.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_SURFACE } from "./pos-classes";

export type PaidScreenCopy = {
  readonly title: string;
  readonly amount: string;
  readonly change: string;
  readonly printReceipt: string;
  readonly emailReceipt: string;
  readonly nextCustomer: string;
};

export type PaidScreenProps = {
  readonly amountCents: number;
  readonly changeCents: number;
  readonly currency: string;
  readonly onPrintReceipt: () => void;
  readonly onEmailReceipt: () => void;
  readonly onNextCustomer: () => void;
  readonly copy: PaidScreenCopy;
  readonly className?: string;
};

export function PaidScreen({
  amountCents,
  changeCents,
  currency,
  onPrintReceipt,
  onEmailReceipt,
  onNextCustomer,
  copy,
  className,
}: PaidScreenProps) {
  return (
    <div data-pos-paid className={cn(POS_SURFACE, "flex w-full max-w-[520px] flex-col items-center gap-6 p-8 text-center", className)}>
      <h2 className="m-0 text-[22px] font-bold tracking-[-0.01em] text-admin-ink">{copy.title}</h2>

      <dl className="grid w-full max-w-xs grid-cols-2 gap-4">
        <div>
          <dt className="text-[13px] text-admin-ink-muted">{copy.amount}</dt>
          <dd className="m-0 text-[28px] font-bold tabular-nums text-admin-ink">
            {formatOrderMoney(amountCents, currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-admin-ink-muted">{copy.change}</dt>
          <dd className="m-0 text-[28px] font-bold tabular-nums text-admin-ink">
            {formatOrderMoney(changeCents, currency)}
          </dd>
        </div>
      </dl>

      <div className="flex w-full max-w-xs gap-3">
        <button type="button" onClick={onPrintReceipt} className={cn(POS_SECONDARY_ACTION, "flex-1")}>
          {copy.printReceipt}
        </button>
        <button type="button" onClick={onEmailReceipt} className={cn(POS_SECONDARY_ACTION, "flex-1")}>
          {copy.emailReceipt}
        </button>
      </div>

      <button
        type="button"
        onClick={onNextCustomer}
        className={cn(POS_PRIMARY_ACTION, "w-full max-w-xs")}
      >
        {copy.nextCustomer}
      </button>
    </div>
  );
}
