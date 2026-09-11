"use client";

/**
 * CustomAmountSheet + ManagerApprovalDialog — C14 and C15.
 *
 * `POSCustomAmount`: `What is it?`, `Reason` and `Report as`, the amount
 * box with its keypad, the `Over your limit · a manager will approve` note,
 * and `Cancel · Continue · ask a manager` (or `Add to sale` under the limit).
 *
 * `POSManagerApproval`: the item / amount / reason card, the managers who
 * can approve (one tile each, from the people with a register PIN), the PIN
 * dots, the `That PIN isn't right` alert, a PIN pad, `Cancel · Approve`.
 *
 * WIRED. `Continue` writes the line through `posAddCustomLine`; a line
 * over `agencies.settings.pos.approval.custom_amount_limit_cents` comes
 * back `needsApproval` and stays locked on the sale until
 * `posApproveCustomAmount` verifies a manager's PIN. Both callbacks belong to
 * the page; this file keeps only the dots and the typed figures.
 */

import { Lock, X } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosDialog, PosSheet } from "./PosSheet";
import { PosKeypad } from "./PosKeypad";
import { initialsOf } from "./CustomerSheet";
import {
  POS_INPUT,
  POS_LABEL,
  POS_NOTE,
  POS_NUM,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
  POS_TOTAL_ROW,
} from "./pos-classes";
import type { PosPerson } from "./pos-types";

export type CustomAmountCopy = {
  readonly title: string;
  readonly subtitle: string;
  readonly what: string;
  readonly reason: string;
  readonly reasonDefault: string;
  readonly reportAs: string;
  readonly reportAsUnavailable: string;
  readonly amount: string;
  /** `Over your {limit} limit · a manager will approve on the next step` */
  readonly limitNote: string;
  /** Under the limit: `Within your {limit} limit · no approval needed` */
  readonly withinLimit: string;
  readonly cancel: string;
  readonly continueAsk: string;
  readonly addToSale: string;
  readonly back: string;
  readonly closeLabel: string;
  readonly approvalTitle: string;
  /** `Custom amount {amount} · {cashier} · over {limit} limit` */
  readonly approvalSubtitle: string;
  readonly item: string;
  readonly whoApproves: string;
  readonly noManagers: string;
  readonly pinPrompt: string;
  readonly approve: string;
  readonly approving: string;
};

export type CustomAmountSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currency: string;
  readonly description: string;
  readonly onDescriptionChange: (value: string) => void;
  readonly amountCents: number;
  readonly onKey: (key: string) => void;
  /** The workspace's approval limit; 0 means every custom amount needs a manager. */
  readonly limitCents: number;
  readonly busy: boolean;
  readonly onContinue: () => void;
  readonly copy: CustomAmountCopy;
};

export function CustomAmountSheet(props: CustomAmountSheetProps) {
  const { copy } = props;
  const ready = props.description.trim().length > 0 && props.amountCents > 0;
  const overLimit = props.amountCents > props.limitCents;
  const limit = formatOrderMoney(props.limitCents, props.currency);
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
        <button type="button" data-pos-custom-continue disabled={!ready || props.busy} onClick={props.onContinue} className={POS_PRIMARY_ACTION}>
          {overLimit ? copy.continueAsk : copy.addToSale}
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
        <p className={POS_NOTE} data-pos-custom-limit={overLimit ? "over" : "within"}>
          <Lock aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{interpolate(overLimit ? copy.limitNote : copy.withinLimit, { limit })}</span>
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
  readonly limitCents: number;
  readonly cashier: string;
  /** The people who can approve: managers holding a register PIN. */
  readonly approvers: readonly PosPerson[];
  readonly approverId: string | null;
  readonly onApproverChange: (userId: string) => void;
  readonly pinLength: number;
  readonly onKey: (key: string) => void;
  /** The last refusal, as a sentence, or null. */
  readonly status: string | null;
  readonly busy: boolean;
  readonly onApprove: () => void;
  readonly copy: CustomAmountCopy;
};

export function ManagerApprovalDialog(props: ManagerApprovalDialogProps) {
  const { copy } = props;
  const amount = formatOrderMoney(props.amountCents, props.currency);
  const limit = formatOrderMoney(props.limitCents, props.currency);
  const canApprove = props.pinLength >= 4 && props.approverId !== null && !props.busy;
  return (
    <PosDialog
      open={props.open}
      name="manager-approval"
      title={copy.approvalTitle}
      subtitle={interpolate(copy.approvalSubtitle, { amount, cashier: props.cashier, limit })}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.cancel}
        </button>
      }
      footerEnd={
        <button type="button" data-pos-approve disabled={!canApprove} onClick={props.onApprove} className={POS_PRIMARY_ACTION}>
          {props.busy ? copy.approving : copy.approve}
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
      <p className={cn(POS_LABEL, "mt-4")}>{copy.whoApproves}</p>
      {props.approvers.length === 0 ? (
        <p role="status" data-pos-approval-no-managers className="m-0 rounded-[12px] bg-admin-surface-alt px-4 py-3 text-[14px] text-admin-ink-muted">
          {copy.noManagers}
        </p>
      ) : (
        <div role="radiogroup" aria-label={copy.whoApproves} className="grid grid-cols-3 gap-2.5">
          {props.approvers.map((person) => {
            const active = person.userId === props.approverId;
            return (
              <button
                key={person.userId}
                type="button"
                role="radio"
                aria-checked={active}
                data-pos-approver={person.userId}
                onClick={() => props.onApproverChange(person.userId)}
                className={cn(
                  "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] px-2 py-2 text-center transition-colors",
                  active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
                )}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-admin-surface-alt text-[12px] font-bold text-admin-ink">
                  {initialsOf(person.name)}
                </span>
                <span className="text-[14px] font-semibold text-admin-ink">{person.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="my-4 flex items-center justify-center gap-3" aria-label={copy.pinPrompt}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 rounded-full",
              i < props.pinLength ? "bg-admin-brand" : i < 4 ? "bg-admin-surface-alt ring-1 ring-admin-border" : "hidden",
            )}
          />
        ))}
      </div>
      {props.status && (
        <p role="alert" data-pos-approval-status className="m-0 mb-4 flex items-start gap-2.5 rounded-[12px] bg-admin-critical-soft px-4 py-3 text-[14px] text-admin-red">
          <X aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>{props.status}</span>
        </p>
      )}
      <PosKeypad onKey={props.onKey} corner="blank" backLabel={copy.back} />
    </PosDialog>
  );
}
