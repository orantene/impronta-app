"use client";

/**
 * HoldSaleDialog + HoldExpiredDialog — C16 and C17.
 *
 * `POSHoldSale`: `Hold this sale?` / `Sale #… · $485 · 3 items`, the `Name
 * it` field, the held-place warning when a line is a class place, and
 * `Back · Discard sale · Hold sale`. Hold is the draft staying open in
 * Orders (the row never expires on its own); Discard is `cancelSale`. A
 * name has no column on the draft yet, so the field is drawn disabled with
 * its sentence (D-POS-21).
 *
 * `POSHoldExpired`: `The … place expired`, three choices and `Later ·
 * confirm`. `Remove it from this sale` is the engine's `removeLine`; `Pick
 * another session` reopens the tile's chooser; `Hold it again` has no
 * re-hold command, so it is drawn disabled with its sentence (D-POS-22).
 */

import { Clock } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosDialog } from "./PosSheet";
import { POS_DANGER_ACTION, POS_INPUT, POS_LABEL, POS_NOTE_WARN, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "./pos-classes";
import type { PosBasketLine } from "./pos-types";

export type HoldSaleCopy = {
  readonly title: string;
  /** `Sale {number} · {total} · {count} items` */
  readonly subtitle: string;
  readonly nameIt: string;
  readonly nameHint: string;
  readonly nameUnavailable: string;
  /** `The {name} place is held until {time}. After that it goes back on sale and the line is removed.` */
  readonly heldNote: string;
  readonly back: string;
  readonly discard: string;
  readonly hold: string;
  readonly closeLabel: string;
};

export type HoldSaleDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly saleNumber: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly lines: readonly PosBasketLine[];
  readonly onDiscard: () => void;
  readonly onHold: () => void;
  readonly busy?: boolean;
  readonly copy: HoldSaleCopy;
};

export function HoldSaleDialog(props: HoldSaleDialogProps) {
  const { copy } = props;
  const held = props.lines.find((line) => line.heldUntil);
  return (
    <PosDialog
      open={props.open}
      name="hold-sale"
      title={copy.title}
      subtitle={interpolate(copy.subtitle, {
        number: props.saleNumber,
        total: formatOrderMoney(props.totalCents, props.currency),
        count: props.lines.length,
      })}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.back}
        </button>
      }
      footerEnd={
        <>
          <button type="button" data-pos-discard disabled={props.busy} onClick={props.onDiscard} className={POS_DANGER_ACTION}>
            {copy.discard}
          </button>
          <button type="button" data-pos-hold-confirm disabled={props.busy} onClick={props.onHold} className={cn(POS_PRIMARY_ACTION, "h-14")}>
            {copy.hold}
          </button>
        </>
      }
    >
      <label className={POS_LABEL} htmlFor="pos-hold-name">
        {copy.nameIt}
      </label>
      <input id="pos-hold-name" className={POS_INPUT} disabled readOnly value="" title={copy.nameUnavailable} />
      <p className="m-0 mt-1.5 text-[13px] text-admin-ink-dim">
        {copy.nameHint} · {copy.nameUnavailable}
      </p>
      {held && (
        <p className={cn(POS_NOTE_WARN, "mt-4")}>
          <Clock aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{interpolate(copy.heldNote, { name: held.label, time: held.heldUntil ?? "" })}</span>
        </p>
      )}
    </PosDialog>
  );
}

export type HoldExpiredCopy = {
  /** `The {name} place expired` */
  readonly title: string;
  readonly subtitle: string;
  readonly holdAgain: string;
  readonly holdAgainUnavailable: string;
  readonly remove: string;
  /** `Sale becomes {total}` */
  readonly removeHint: string;
  readonly pickAnother: string;
  readonly later: string;
  readonly confirmRemove: string;
  readonly confirmPick: string;
  readonly closeLabel: string;
};

export type HoldExpiredChoice = "again" | "remove" | "pick";

export type HoldExpiredDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly line: PosBasketLine | null;
  readonly currency: string;
  readonly totalCents: number;
  readonly choice: HoldExpiredChoice;
  readonly onChoiceChange: (choice: HoldExpiredChoice) => void;
  readonly onRemove: (lineId: string) => void;
  readonly onPickAnother: (lineId: string) => void;
  readonly busy?: boolean;
  readonly copy: HoldExpiredCopy;
};

const CHOICE =
  "flex w-full items-start gap-3 rounded-[14px] border-[1.5px] px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand disabled:cursor-not-allowed disabled:opacity-60";

function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px]",
        on ? "border-admin-brand bg-admin-brand" : "border-admin-border bg-admin-card",
      )}
    >
      {on && <span className="h-2.5 w-2.5 rounded-full bg-admin-card" />}
    </span>
  );
}

export function HoldExpiredDialog(props: HoldExpiredDialogProps) {
  const { copy, line } = props;
  if (!line) return null;
  const after = props.totalCents - line.unitCents * line.units - (line.addonCents ?? 0);
  const confirm = props.choice === "remove" ? () => props.onRemove(line.id) : props.choice === "pick" ? () => props.onPickAnother(line.id) : undefined;
  return (
    <PosDialog
      open={props.open}
      name="hold-expired"
      title={interpolate(copy.title, { name: line.label })}
      subtitle={interpolate(copy.subtitle, { time: line.heldUntil ?? "" })}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerStart={
        <button type="button" onClick={props.onClose} className={POS_SECONDARY_ACTION}>
          {copy.later}
        </button>
      }
      footerEnd={
        <button type="button" data-pos-expired-confirm disabled={!confirm || props.busy} onClick={confirm} className={cn(POS_PRIMARY_ACTION, "h-14")}>
          {props.choice === "pick" ? copy.confirmPick : interpolate(copy.confirmRemove, { total: formatOrderMoney(Math.max(0, after), props.currency) })}
        </button>
      }
    >
      <div role="radiogroup" aria-label={copy.title} className="flex flex-col gap-2.5">
        <button
          type="button"
          role="radio"
          aria-checked={props.choice === "again"}
          disabled
          title={copy.holdAgainUnavailable}
          className={cn(CHOICE, "border-admin-border bg-admin-card")}
        >
          <Radio on={props.choice === "again"} />
          <span>
            <span className="block text-[16px] font-semibold text-admin-ink">{copy.holdAgain}</span>
            <span className="block text-[14px] text-admin-ink-muted">{copy.holdAgainUnavailable}</span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={props.choice === "remove"}
          onClick={() => props.onChoiceChange("remove")}
          className={cn(CHOICE, props.choice === "remove" ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card")}
        >
          <Radio on={props.choice === "remove"} />
          <span>
            <span className="block text-[16px] font-semibold text-admin-ink">{copy.remove}</span>
            <span className="block text-[14px] text-admin-ink-muted">
              {interpolate(copy.removeHint, { total: formatOrderMoney(Math.max(0, after), props.currency) })}
            </span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={props.choice === "pick"}
          onClick={() => props.onChoiceChange("pick")}
          className={cn(CHOICE, props.choice === "pick" ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card")}
        >
          <Radio on={props.choice === "pick"} />
          <span className="block text-[16px] font-semibold text-admin-ink">{copy.pickAnother}</span>
        </button>
      </div>
    </PosDialog>
  );
}
