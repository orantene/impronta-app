"use client";

/**
 * CashDoneDialog — M03, `POSCashDone`: `Drawer open` / `Give $110 change`,
 * the change figure, `Received $1,500 · $1,390 recorded as cash`, the
 * `Drawer didn't open?` note, and `Open drawer · Done · receipt`.
 *
 * The money is already recorded when this opens (the collection succeeded);
 * `Done · receipt` moves to the paid screen. `Open drawer` has no device
 * behind it (no cash-drawer driver exists), so it is disabled with its
 * sentence (D-POS-25).
 */

import { AlertTriangle } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosDialog } from "./PosSheet";
import { POS_NOTE, POS_NUM, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "./pos-classes";

export type CashDoneCopy = {
  readonly title: string;
  /** `Give {amount} change` */
  readonly subtitle: string;
  readonly subtitleExact: string;
  /** `Received {tendered} · {amount} recorded as cash` */
  readonly received: string;
  readonly drawerNote: string;
  readonly openDrawer: string;
  readonly openDrawerUnavailable: string;
  readonly done: string;
  readonly closeLabel: string;
};

export type CashDoneDialogProps = {
  readonly open: boolean;
  readonly amountCents: number;
  readonly tenderedCents: number;
  readonly changeCents: number;
  readonly currency: string;
  readonly onDone: () => void;
  readonly copy: CashDoneCopy;
};

export function CashDoneDialog(props: CashDoneDialogProps) {
  const { copy } = props;
  const change = formatOrderMoney(props.changeCents, props.currency);
  return (
    <PosDialog
      open={props.open}
      name="cash-done"
      title={copy.title}
      subtitle={props.changeCents > 0 ? interpolate(copy.subtitle, { amount: change }) : copy.subtitleExact}
      closeLabel={copy.closeLabel}
      onClose={props.onDone}
      footerStart={
        <button type="button" disabled title={copy.openDrawerUnavailable} className={POS_SECONDARY_ACTION}>
          {copy.openDrawer}
          <span className="sr-only">{copy.openDrawerUnavailable}</span>
        </button>
      }
      footerEnd={
        <button type="button" data-pos-cash-done onClick={props.onDone} className={cn(POS_PRIMARY_ACTION, "h-14")}>
          {copy.done}
        </button>
      }
    >
      <p data-pos-change-due className={cn("m-0 text-center text-[56px] font-bold leading-none tracking-[-0.03em] text-admin-ink", POS_NUM)}>
        {change}
      </p>
      <p className="m-0 mt-4 text-center text-[15px] text-admin-ink-muted">
        {interpolate(copy.received, {
          tendered: formatOrderMoney(props.tenderedCents, props.currency),
          amount: formatOrderMoney(props.amountCents, props.currency),
        })}
      </p>
      <p className={cn(POS_NOTE, "mt-5")}>
        <AlertTriangle aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <span>{copy.drawerNote}</span>
      </p>
    </PosDialog>
  );
}
