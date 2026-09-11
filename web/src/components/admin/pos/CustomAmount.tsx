"use client";

/**
 * CustomAmountSheet + ManagerApprovalDialog — C14 and C15.
 *
 * `POSCustomAmount`: `What is it?`, `Reason` and `Report as`, the amount
 * box with its keypad, the `Over your limit · a manager will approve` note,
 * and `Cancel · Continue · ask a manager`.
 *
 * `POSManagerApproval`: the item / amount / reason card, four PIN dots, the
 * `That PIN isn't right · 2 tries left` alert, a PIN pad, `Cancel · Approve`.
 *
 * NEITHER IS WIRED TO THE ENGINE YET. A sale line is priced from a
 * catalog offering (`addLine` takes an `offeringId`) and there is no
 * manager-PIN table, so `Continue` opens the approval dialog exactly as the
 * board draws it and `Approve` is disabled with its sentence (D-POS-20). The
 * amount and description the cashier typed are kept so the sentence is met
 * with the work still on screen, not lost.
 */

import { Lock, X } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosDialog, PosSheet } from "./PosSheet";
import { PosKeypad } from "./PosKeypad";
import {
  POS_INPUT,
  POS_LABEL,
  POS_NOTE,
  POS_NUM,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
  POS_TOTAL_ROW,
} from "./pos-classes";

export type CustomAmountCopy = {
  readonly title: string;
  readonly subtitle: string;
  readonly what: string;
  readonly reason: string;
  readonly reasonDefault: string;
  readonly reportAs: string;
  readonly reportAsUnavailable: string;
  readonly amount: string;
  readonly limitNote: string;
  readonly cancel: string;
  readonly continueAsk: string;
  readonly back: string;
  readonly closeLabel: string;
  readonly approvalTitle: string;
  /** `Custom amount {amount} · {cashier}` */
  readonly approvalSubtitle: string;
  readonly item: string;
  readonly pinWrong: string;
  readonly approve: string;
  readonly approveUnavailable: string;
};

export type CustomAmountSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currency: string;
  readonly description: string;
  readonly onDescriptionChange: (value: string) => void;
  readonly amountCents: number;
  readonly onKey: (key: string) => void;
  readonly onContinue: () => void;
  readonly copy: CustomAmountCopy;
};

export function CustomAmountSheet(props: CustomAmountSheetProps) {
  const { copy } = props;
  const ready = props.description.trim().length > 0 && props.amountCents > 0;
  return (
    <PosSheet
      open={props.open}
      name="custom-amount"
      title={copy.title}
      subtitle={copy.subtitle}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.cancel}
        </button>
      }
      footerEnd={
        <button type="button" data-pos-custom-continue disabled={!ready} onClick={props.onContinue} className={POS_PRIMARY_ACTION}>
          {copy.continueAsk}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className={POS_LABEL} htmlFor="pos-custom-what">
            {copy.what} <span className="text-admin-red">*</span>
          </label>
          <input
            id="pos-custom-what"
            className={POS_INPUT}
            value={props.description}
            onChange={(e) => props.onDescriptionChange(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <span className={POS_LABEL}>
              {copy.reason} <span className="text-admin-red">*</span>
            </span>
            <input className={POS_INPUT} readOnly value={copy.reasonDefault} />
          </div>
          <div>
            <span className={POS_LABEL}>{copy.reportAs}</span>
            <input className={POS_INPUT} disabled readOnly value="" title={copy.reportAsUnavailable} />
            <p className="m-0 mt-1.5 text-[13px] text-admin-ink-dim">{copy.reportAsUnavailable}</p>
          </div>
        </div>
        <div className="flex h-[52px] items-center justify-between rounded-[12px] border-[1.5px] border-admin-ink px-4">
          <span className="text-[14px] text-admin-ink-muted">{copy.amount}</span>
          <span data-pos-custom-amount className={cn("text-[30px] font-bold tracking-[-0.025em] text-admin-ink", POS_NUM)}>
            {formatOrderMoney(props.amountCents, props.currency)}
          </span>
        </div>
        <PosKeypad onKey={props.onKey} backLabel={copy.back} />
        <p className={POS_NOTE}>
          <Lock aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{copy.limitNote}</span>
        </p>
      </div>
    </PosSheet>
  );
}

export type ManagerApprovalDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currency: string;
  readonly description: string;
  readonly amountCents: number;
  readonly cashier: string;
  readonly pinLength: number;
  readonly onKey: (key: string) => void;
  readonly copy: CustomAmountCopy;
};

export function ManagerApprovalDialog(props: ManagerApprovalDialogProps) {
  const { copy } = props;
  const amount = formatOrderMoney(props.amountCents, props.currency);
  return (
    <PosDialog
      open={props.open}
      name="manager-approval"
      title={copy.approvalTitle}
      subtitle={interpolate(copy.approvalSubtitle, { amount, cashier: props.cashier })}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.cancel}
        </button>
      }
      footerEnd={
        <button type="button" data-pos-approve disabled title={copy.approveUnavailable} className={POS_PRIMARY_ACTION}>
          {copy.approve}
          <span className="sr-only">{copy.approveUnavailable}</span>
        </button>
      }
    >
      <dl className="m-0 rounded-[14px] border-[1.5px] border-admin-border px-4 pb-1 pt-1">
        <div className={POS_TOTAL_ROW}>
          <dt className="text-admin-ink-muted">{copy.item}</dt>
          <dd className="m-0 font-semibold text-admin-ink">{props.description}</dd>
        </div>
        <div className={POS_TOTAL_ROW}>
          <dt className="text-admin-ink-muted">{copy.amount}</dt>
          <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>{amount}</dd>
        </div>
        <div className={cn(POS_TOTAL_ROW, "border-b-0")}>
          <dt className="text-admin-ink-muted">{copy.reason}</dt>
          <dd className="m-0 font-semibold text-admin-ink">{copy.reasonDefault}</dd>
        </div>
      </dl>
      <div className="my-4 flex items-center justify-center gap-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-3.5 w-3.5 rounded-full", i < props.pinLength ? "bg-admin-brand" : "bg-admin-surface-alt ring-1 ring-admin-border")} />
        ))}
      </div>
      <p role="status" data-pos-approval-status className="m-0 mb-4 flex items-start gap-2.5 rounded-[12px] bg-admin-critical-soft px-4 py-3 text-[14px] text-admin-red">
        <X aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
        <span>{copy.approveUnavailable}</span>
      </p>
      <PosKeypad onKey={props.onKey} corner="blank" backLabel={copy.back} />
    </PosDialog>
  );
}
