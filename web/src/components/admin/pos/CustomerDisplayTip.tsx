"use client";

/**
 * The customer display's tip states (D02 `CDReview`'s right half, D03
 * `CDCustomTip`): `Add a tip?`, `10% · 15% · 20%` of the services with the
 * figure under each, `Other amount`, `No tip`, and the custom-amount screen
 * with its keypad and `Total would be`. Written for the customer's side:
 * large type, one action per tile, nothing charged from here (the note says
 * so). The figure chosen goes to the display client, which writes it with
 * `posSetTip`; the sale's own `tipCents` then comes back on the next poll.
 */

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosKeypad } from "./PosKeypad";
import { TIP_PERCENTS, tipForPercent } from "./TipSheet";
import { POS_NUM, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "./pos-classes";

export type CustomerDisplayTipCopy = {
  readonly heading: string;
  /** `On services of {amount} · rounded to the nearest cent` */
  readonly base: string;
  readonly other: string;
  readonly otherHint: string;
  readonly noTip: string;
  readonly note: string;
  /** `Tip added · {amount}` */
  readonly added: string;
  readonly change: string;
  readonly saving: string;
  readonly customHeading: string;
  readonly customBase: string;
  /** `Total would be {amount}` */
  readonly totalWouldBe: string;
  readonly back: string;
  /** `Add {amount} tip` */
  readonly add: string;
  readonly keypadBack: string;
};

export type CustomerDisplayTipProps = {
  readonly currency: string;
  readonly baseCents: number;
  readonly totalBeforeTipCents: number;
  readonly tipCents: number;
  readonly saving: boolean;
  readonly refusal: string | null;
  readonly onPick: (cents: number) => void;
  readonly onOther: () => void;
  readonly onChange: () => void;
  readonly copy: CustomerDisplayTipCopy;
};

const TILE = "flex min-h-[96px] flex-col items-center justify-center rounded-[16px] border-[1.5px] border-admin-border bg-admin-surface transition-colors hover:bg-admin-surface-alt disabled:opacity-60";

export function CustomerDisplayTip(props: CustomerDisplayTipProps) {
  const { copy, currency } = props;
  const money = (cents: number) => formatOrderMoney(cents, currency);
  if (props.tipCents > 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" data-pos-display-tip="added">
        <p className={cn("m-0 text-2xl font-semibold", POS_NUM)}>{interpolate(copy.added, { amount: money(props.tipCents) })}</p>
        <button type="button" className={cn(POS_SECONDARY_ACTION, "h-14 max-w-xs border-admin-border bg-admin-surface text-admin-ink")} onClick={props.onChange} disabled={props.saving}>
          {copy.change}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 text-center" data-pos-display-tip="choose">
      <h2 className="m-0 text-3xl font-semibold tracking-tight">{copy.heading}</h2>
      <p className="m-0 text-base text-admin-ink-muted">{interpolate(copy.base, { amount: money(props.baseCents) })}</p>
      <div className="grid w-full max-w-xl grid-cols-3 gap-3">
        {TIP_PERCENTS.map((percent) => {
          const cents = tipForPercent(props.baseCents, percent);
          return (
            <button key={percent} type="button" data-pos-display-tip-percent={percent} disabled={props.saving || cents <= 0} onClick={() => props.onPick(cents)} className={TILE}>
              <span className={cn("text-[30px] font-bold", POS_NUM)}>{percent}%</span>
              <span className={cn("text-[15px] text-admin-ink-muted", POS_NUM)}>{money(cents)}</span>
            </button>
          );
        })}
        <button type="button" data-pos-display-tip-other disabled={props.saving} onClick={props.onOther} className={TILE}>
          <span className="text-[24px] font-bold">{copy.other}</span>
          <span className="text-[15px] text-admin-ink-muted">{copy.otherHint}</span>
        </button>
        <button type="button" data-pos-display-tip-none disabled={props.saving} onClick={() => props.onPick(0)} className={cn(TILE, "col-span-2")}>
          <span className="text-[24px] font-bold">{copy.noTip}</span>
        </button>
      </div>
      {props.refusal ? (
        <p role="alert" data-pos-display-tip-refusal className="m-0 text-base text-destructive">
          {props.refusal}
        </p>
      ) : (
        <p role="status" className="m-0 text-sm text-admin-ink-muted">
          {props.saving ? copy.saving : copy.note}
        </p>
      )}
    </div>
  );
}

export type CustomerDisplayCustomTipProps = {
  readonly currency: string;
  readonly baseCents: number;
  readonly totalBeforeTipCents: number;
  readonly customCents: number;
  readonly saving: boolean;
  readonly refusal: string | null;
  readonly onKey: (key: string) => void;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly copy: CustomerDisplayTipCopy;
};

export function CustomerDisplayCustomTip(props: CustomerDisplayCustomTipProps) {
  const { copy, currency } = props;
  const money = (cents: number) => formatOrderMoney(cents, currency);
  return (
    <div className="mx-auto grid w-full max-w-4xl grid-cols-2 items-center gap-10 max-[900px]:grid-cols-1" data-pos-display-tip="custom">
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">{copy.customHeading}</h2>
        <p className="m-0 text-base text-admin-ink-muted">{interpolate(copy.customBase, { amount: money(props.baseCents) })}</p>
        <div className={cn("flex h-[80px] w-full max-w-sm items-center justify-center rounded-[16px] border-2 border-admin-brand bg-admin-surface text-[44px] font-bold tracking-tight", POS_NUM)} data-pos-display-tip-custom>
          {money(props.customCents)}
        </div>
        <p className="m-0 text-base text-admin-ink-muted">{interpolate(copy.totalWouldBe, { amount: money(props.totalBeforeTipCents + props.customCents) })}</p>
        {props.refusal && (
          <p role="alert" data-pos-display-tip-refusal className="m-0 text-base text-destructive">
            {props.refusal}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <PosKeypad onKey={props.onKey} backLabel={copy.keypadBack} disabled={props.saving} />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={cn(POS_SECONDARY_ACTION, "h-14 border-admin-border bg-admin-surface text-admin-ink")} onClick={props.onBack} disabled={props.saving}>
            {copy.back}
          </button>
          <button type="button" data-pos-display-tip-confirm className={cn(POS_PRIMARY_ACTION, "bg-admin-ink text-admin-surface")} onClick={props.onConfirm} disabled={props.saving || props.customCents <= 0}>
            {props.saving ? copy.saving : interpolate(copy.add, { amount: money(props.customCents) })}
          </button>
        </div>
      </div>
    </div>
  );
}
