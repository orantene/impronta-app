"use client";

/**
 * DiscountSheet — `POSDiscount`: the `Enter a code · Manual discount · Comp
 * an item` segmented control, the reason/amount fields, the `ELIGIBLE LINES`
 * list, the `Before / Discount / After` card, the not-combinable alert, and
 * `Cancel · Apply −$31`.
 *
 * WHAT IS WIRED. `Enter a code` is the engine's `repriceAndValidate` with a
 * promo code; the discount it resolves is what `Before / Discount / After`
 * shows once applied. A manual percentage and a comp have no writer on the
 * sale (the engine prices lines from the catalog and discounts only through
 * a code), so those two tabs are drawn with their controls disabled and one
 * sentence each (D-POS-19). Which lines a code touches is the engine's
 * decision, so the eligible list is read-only.
 */

import { AlertTriangle } from "lucide-react";

import { formatOrderMoney } from "@/lib/orders/money-format";
import { lineTotalCents } from "@/lib/cart/totals";
import { cn } from "@/lib/utils";
import { basketTotals } from "./pos-math";
import { PosSheet } from "./PosSheet";
import {
  POS_EYEBROW,
  POS_INPUT,
  POS_LABEL,
  POS_NOTE_WARN,
  POS_NUM,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
  POS_SEGMENT,
  POS_SEGMENT_ACTIVE,
  POS_SEGMENT_IDLE,
  POS_SEGMENT_TRACK,
  POS_TOTAL_ROW,
} from "./pos-classes";
import type { PosBasketLine } from "./pos-types";

export type DiscountTab = "code" | "manual" | "comp";

export type DiscountSheetCopy = {
  readonly title: string;
  readonly subtitle: string;
  readonly tabCode: string;
  readonly tabManual: string;
  readonly tabComp: string;
  readonly codeLabel: string;
  readonly codePlaceholder: string;
  readonly amount: string;
  readonly reason: string;
  readonly manualUnavailable: string;
  readonly compUnavailable: string;
  readonly eligible: string;
  readonly eligibleNote: string;
  readonly before: string;
  readonly discount: string;
  readonly after: string;
  readonly notCombinable: string;
  readonly refused: string;
  readonly cancel: string;
  /** `Apply {amount}` / plain `Apply` */
  readonly apply: string;
  readonly remove: string;
  readonly closeLabel: string;
};

export type DiscountSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly tab: DiscountTab;
  readonly onTabChange: (tab: DiscountTab) => void;
  readonly lines: readonly PosBasketLine[];
  readonly currency: string;
  readonly discountCents: number;
  readonly code: string;
  readonly onCodeChange: (value: string) => void;
  readonly onApply: () => void;
  readonly onRemoveCode: () => void;
  readonly applying?: boolean;
  /** The last apply was refused: `notCombinable` says why when the engine did. */
  readonly refused: null | "notCombinable" | "refused";
  readonly copy: DiscountSheetCopy;
};

export function DiscountSheet(props: DiscountSheetProps) {
  const { copy } = props;
  const totals = basketTotals(props.lines, props.discountCents);
  const before = totals.subtotalCents;
  const applied = props.discountCents > 0;
  const canApply = props.tab === "code" && props.code.trim().length > 0 && !props.applying;

  return (
    <PosSheet
      open={props.open}
      name="discount"
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
        <>
          {applied && (
            <button type="button" data-pos-discount-remove disabled={props.applying} onClick={props.onRemoveCode} className={POS_SECONDARY_ACTION}>
              {copy.remove}
            </button>
          )}
          <button type="button" data-pos-discount-apply disabled={!canApply} onClick={props.onApply} className={POS_PRIMARY_ACTION}>
            {copy.apply}
          </button>
        </>
      }
    >
      <div className={cn(POS_SEGMENT_TRACK, "w-full")} role="tablist" aria-label={copy.title}>
        {(["code", "manual", "comp"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={props.tab === tab}
            onClick={() => props.onTabChange(tab)}
            className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", props.tab === tab ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
          >
            {tab === "code" ? copy.tabCode : tab === "manual" ? copy.tabManual : copy.tabComp}
          </button>
        ))}
      </div>

      {props.tab === "code" ? (
        <div className="mt-4">
          <label className={POS_LABEL} htmlFor="pos-discount-code">
            {copy.codeLabel}
          </label>
          <input
            id="pos-discount-code"
            className={cn(POS_INPUT, "font-mono uppercase")}
            placeholder={copy.codePlaceholder}
            value={props.code}
            onChange={(e) => props.onCodeChange(e.target.value)}
            autoComplete="off"
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3.5">
          <div>
            <span className={POS_LABEL}>{copy.amount}</span>
            <input className={POS_INPUT} disabled readOnly value="" />
          </div>
          <div>
            <span className={POS_LABEL}>
              {copy.reason} <span className="text-admin-red">*</span>
            </span>
            <input className={POS_INPUT} disabled readOnly value="" />
          </div>
          <p role="status" data-pos-discount-unavailable className="col-span-2 m-0 text-[14px] text-admin-ink-muted">
            {props.tab === "manual" ? copy.manualUnavailable : copy.compUnavailable}
          </p>
        </div>
      )}

      <p className={cn(POS_EYEBROW, "m-0 mt-5 mb-2")}>{copy.eligible}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {props.lines.map((line) => (
          <li
            key={line.id}
            className="flex items-center gap-3 rounded-[12px] border-[1.5px] border-admin-border px-4 py-3 text-[15px]"
          >
            <span className="flex-1 truncate text-admin-ink-muted">
              {line.label}
              {line.units > 1 ? ` × ${line.units}` : ""}
            </span>
            <span className={cn("font-mono text-admin-ink-muted", POS_NUM)}>
              {formatOrderMoney(lineTotalCents(line), props.currency)}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 text-[13px] text-admin-ink-dim">{copy.eligibleNote}</p>

      <dl className="m-0 mt-5 rounded-[14px] border-[1.5px] border-admin-border px-4 pb-1 pt-1">
        <div className={POS_TOTAL_ROW}>
          <dt className="text-admin-ink-muted">{copy.before}</dt>
          <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>{formatOrderMoney(before, props.currency)}</dd>
        </div>
        <div className={POS_TOTAL_ROW}>
          <dt className="text-admin-ink-muted">{copy.discount}</dt>
          <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>
            {applied ? `−${formatOrderMoney(totals.discountCents, props.currency)}` : "—"}
          </dd>
        </div>
        <div className={cn(POS_TOTAL_ROW, "border-b-0")}>
          <dt className="font-bold text-admin-ink">{copy.after}</dt>
          <dd className={cn("m-0 font-bold text-admin-ink", POS_NUM)}>{formatOrderMoney(totals.totalCents, props.currency)}</dd>
        </div>
      </dl>

      {props.refused && (
        <p role="alert" data-pos-discount-refused={props.refused} className={cn(POS_NOTE_WARN, "mt-4")}>
          <AlertTriangle aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{props.refused === "notCombinable" ? copy.notCombinable : copy.refused}</span>
        </p>
      )}
    </PosSheet>
  );
}
