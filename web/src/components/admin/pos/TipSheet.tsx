"use client";

/**
 * TipSheet — the basket's `Tip` row (the counter's half of D02 / D03): a
 * gratuity on the sale before it is collected. `10% · 15% · 20%` of the
 * subtotal after discount, `Other amount` with a keypad, `No tip`; the
 * chosen figure goes to the page, which writes it through `posSetTip`
 * (`orders.tip_cents`, never a line). Totals follow the engine's own rule,
 * subtotal - discount + tax + tip, so the figure under `Total would be` is
 * the one the charge will ask for.
 */

import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosKeypad } from "./PosKeypad";
import { PosSheet } from "./PosSheet";
import { POS_NUM, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "./pos-classes";

export const TIP_PERCENTS = [10, 15, 20] as const;

/** A percentage of the base, rounded to the nearest minor unit. */
export function tipForPercent(baseCents: number, percent: number): number {
  return Math.round((Math.max(0, baseCents) * percent) / 100);
}

export type TipSheetCopy = {
  readonly title: string;
  /** `On {amount} · rounded to the nearest cent` */
  readonly subtitle: string;
  readonly other: string;
  readonly otherHint: string;
  readonly noTip: string;
  /** `Total would be {amount}` */
  readonly totalWouldBe: string;
  /** `Add {amount} tip` */
  readonly add: string;
  readonly remove: string;
  readonly back: string;
  readonly closeLabel: string;
};

export type TipSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currency: string;
  /** Subtotal after discount, before tax: what a percentage is taken of. */
  readonly baseCents: number;
  /** The sale's total without a tip. */
  readonly totalBeforeTipCents: number;
  readonly tipCents: number;
  readonly busy: boolean;
  readonly onSetTip: (cents: number) => void;
  readonly copy: TipSheetCopy;
};

export function TipSheet(props: TipSheetProps) {
  const { copy, currency } = props;
  const [custom, setCustom] = useState<number | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const money = (cents: number) => formatOrderMoney(cents, currency);
  const pending = custom !== null ? custom : (chosen ?? props.tipCents);

  const keypad = (key: string) => {
    setCustom((current) => {
      const now = current ?? 0;
      if (key === "back") return Math.floor(now / 10);
      if (key === "clear") return 0;
      const next = key === "00" ? now * 100 : now * 10 + Number(key);
      return Number.isFinite(next) && next <= 99_999_999 ? next : now;
    });
    setChosen(null);
  };

  return (
    <PosSheet
      open={props.open}
      name="tip"
      title={copy.title}
      subtitle={interpolate(copy.subtitle, { amount: money(props.baseCents) })}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.back}
        </button>
      }
      footerEnd={
        <button type="button" data-pos-tip-confirm disabled={props.busy || pending === props.tipCents} onClick={() => props.onSetTip(pending)} className={POS_PRIMARY_ACTION}>
          {pending === 0 ? copy.remove : interpolate(copy.add, { amount: money(pending) })}
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {TIP_PERCENTS.map((percent) => {
          const cents = tipForPercent(props.baseCents, percent);
          const active = custom === null && pending === cents && cents > 0;
          return (
            <button
              key={percent}
              type="button"
              aria-pressed={active}
              data-pos-tip-percent={percent}
              onClick={() => {
                setCustom(null);
                setChosen(cents);
              }}
              className={cn(
                "flex min-h-[92px] flex-col items-center justify-center rounded-[14px] border-[1.5px] transition-colors",
                active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
              )}
            >
              <span className={cn("text-[28px] font-bold text-admin-ink", POS_NUM)}>{percent}%</span>
              <span className={cn("text-[14px] text-admin-ink-muted", POS_NUM)}>{money(cents)}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom !== null}
          data-pos-tip-other
          onClick={() => setCustom((c) => c ?? 0)}
          className={cn(
            "flex min-h-[92px] flex-col items-center justify-center rounded-[14px] border-[1.5px] transition-colors",
            custom !== null ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
          )}
        >
          <span className="text-[22px] font-bold text-admin-ink">{copy.other}</span>
          <span className="text-[14px] text-admin-ink-muted">{copy.otherHint}</span>
        </button>
        <button
          type="button"
          aria-pressed={custom === null && pending === 0}
          data-pos-tip-none
          onClick={() => {
            setCustom(null);
            setChosen(0);
          }}
          className={cn(
            "col-span-2 flex min-h-[92px] items-center justify-center rounded-[14px] border-[1.5px] transition-colors",
            custom === null && pending === 0 ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
          )}
        >
          <span className="text-[22px] font-bold text-admin-ink">{copy.noTip}</span>
        </button>
      </div>
      {custom !== null && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex h-[64px] items-center justify-between rounded-[14px] border-[1.5px] border-admin-brand bg-admin-card px-5">
            <span className="text-[15px] text-admin-ink-muted">{copy.other}</span>
            <span data-pos-tip-custom className={cn("text-[34px] font-bold tracking-[-0.025em] text-admin-ink", POS_NUM)}>
              {money(custom)}
            </span>
          </div>
          <PosKeypad onKey={keypad} backLabel={copy.back} />
        </div>
      )}
      <p className="m-0 mt-4 text-center text-[14px] text-admin-ink-muted" data-pos-tip-total>
        {interpolate(copy.totalWouldBe, { amount: money(props.totalBeforeTipCents + pending) })}
      </p>
    </PosSheet>
  );
}
