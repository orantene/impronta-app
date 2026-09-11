"use client";

/**
 * CashMovementDialog — one movement on the open drawer (`POSCashMovements`):
 * the amount box with its keypad and the reason line, for `Add cash` (float
 * added), `Take cash out` (paid out) and `Drop to safe`. The confirm goes to
 * the page, which writes it through `posRecordShiftMovement`; the engine
 * refuses a zero amount (`amount`) and a closed shift (`already_closed`) in
 * a sentence the dialog shows.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import type { CashMovementKind } from "./CashDrawerScreen";
import { PosDialog } from "./PosSheet";
import { PosKeypad } from "./PosKeypad";
import { POS_INPUT, POS_LABEL, POS_NUM, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "./pos-classes";

export type CashMovementCopy = {
  readonly title: Readonly<Record<CashMovementKind, string>>;
  readonly subtitle: Readonly<Record<CashMovementKind, string>>;
  readonly amount: string;
  readonly reason: string;
  readonly reasonHint: string;
  readonly cancel: string;
  /** `Record {amount}` */
  readonly confirm: string;
  readonly recording: string;
  readonly back: string;
  readonly closeLabel: string;
};

export type CashMovementDialogProps = {
  readonly open: boolean;
  readonly kind: CashMovementKind;
  readonly currency: string;
  readonly amountCents: number;
  readonly onKey: (key: string) => void;
  readonly reason: string;
  readonly onReasonChange: (value: string) => void;
  readonly status: string | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly copy: CashMovementCopy;
};

export function CashMovementDialog(props: CashMovementDialogProps) {
  const { copy, kind } = props;
  const amount = formatOrderMoney(props.amountCents, props.currency);
  const ready = props.amountCents > 0 && props.reason.trim().length > 0 && !props.busy;
  return (
    <PosDialog
      open={props.open}
      name="cash-movement"
      title={copy.title[kind]}
      subtitle={copy.subtitle[kind]}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.cancel}
        </button>
      }
      footerEnd={
        <button type="button" data-pos-movement-confirm disabled={!ready} onClick={props.onConfirm} className={POS_PRIMARY_ACTION}>
          {props.busy ? copy.recording : copy.confirm.replace("{amount}", amount)}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex h-[64px] items-center justify-between rounded-[14px] border-[1.5px] border-admin-brand bg-admin-card px-5">
          <span className="text-[15px] text-admin-ink-muted">{copy.amount}</span>
          <span data-pos-movement-amount className={cn("text-[34px] font-bold tracking-[-0.025em] text-admin-ink", POS_NUM)}>
            {amount}
          </span>
        </div>
        <PosKeypad onKey={props.onKey} backLabel={copy.back} />
        <div>
          <label className={POS_LABEL} htmlFor="pos-movement-reason">
            {copy.reason} <span className="text-admin-red">*</span>
          </label>
          <input
            id="pos-movement-reason"
            className={POS_INPUT}
            value={props.reason}
            onChange={(e) => props.onReasonChange(e.target.value)}
            placeholder={copy.reasonHint}
            maxLength={200}
            autoComplete="off"
          />
        </div>
        {props.status && (
          <p role="alert" data-pos-movement-status className="m-0 rounded-[12px] bg-admin-critical-soft px-4 py-3 text-[14px] text-admin-red">
            {props.status}
          </p>
        )}
      </div>
    </PosDialog>
  );
}
