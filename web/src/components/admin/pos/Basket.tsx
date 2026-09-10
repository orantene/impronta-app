"use client";

/**
 * Basket — C03/C12's working basket: line items with quantity controls and
 * removal, a discount/promo-code field, totals, and the one Charge action.
 *
 * Totals are never computed inline here; `basketTotals` (pos-math.ts) wraps
 * the engine's own `cartTotals`, so this screen agrees with the write path
 * on every cent by construction rather than by two authors keeping two sums
 * in sync.
 *
 * Charge is disabled on an empty basket AND while a charge attempt is
 * already open (spec C03, §4) — both conditions are the caller's to compute
 * and pass in as `chargeDisabled`/`chargeLoading`; this component only
 * renders the state, it never decides it.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { basketTotals } from "./pos-math";
import {
  POS_ICON_ACTION,
  POS_INPUT,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
} from "./pos-classes";
import type { PosBasketLine } from "./pos-types";

export type BasketCopy = {
  readonly title: string;
  readonly empty: string;
  readonly decrease: string;
  readonly increase: string;
  readonly remove: string;
  readonly discountLabel: string;
  readonly discountPlaceholder: string;
  readonly applyDiscount: string;
  readonly discountNotCombinable: string;
  readonly subtotal: string;
  readonly discount: string;
  readonly total: string;
  readonly charge: string;
  readonly chargeEmptyHint: string;
  readonly chargeLoading: string;
};

export type BasketProps = {
  readonly lines: readonly PosBasketLine[];
  readonly currency: string;
  /** Already-resolved discount, in cents — 0 when none is applied. */
  readonly discountCents?: number;
  readonly discountCode: string;
  readonly onDiscountCodeChange: (value: string) => void;
  readonly onApplyDiscount: () => void;
  readonly discountApplying?: boolean;
  /** Set when C13's "not combinable" refusal fired on the last apply. */
  readonly discountNotCombinable?: boolean;
  readonly onIncrement: (lineId: string) => void;
  readonly onDecrement: (lineId: string) => void;
  readonly onRemove: (lineId: string) => void;
  readonly onCharge: () => void;
  readonly chargeLoading?: boolean;
  readonly copy: BasketCopy;
  readonly className?: string;
};

export function Basket({
  lines,
  currency,
  discountCents = 0,
  discountCode,
  onDiscountCodeChange,
  onApplyDiscount,
  discountApplying,
  discountNotCombinable,
  onIncrement,
  onDecrement,
  onRemove,
  onCharge,
  chargeLoading,
  copy,
  className,
}: BasketProps) {
  const totals = basketTotals(lines, discountCents);
  const isEmpty = lines.length === 0;
  const chargeDisabled = isEmpty || Boolean(chargeLoading);

  return (
    <div className={cn("flex h-full flex-col gap-4 p-4", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {copy.title}
      </h2>

      {isEmpty ? (
        <p className="flex-1 text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="flex-1 space-y-2 overflow-y-auto">
          {lines.map((line) => {
            const lineTotal =
              Math.max(0, Math.trunc(line.units)) * Math.max(0, Math.trunc(line.unitCents)) +
              (line.addonCents ?? 0);
            return (
              <li
                key={line.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{line.label}</p>
                  {(line.variantLabel || line.sessionLabel) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {[line.variantLabel, line.sessionLabel].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={copy.decrease}
                    disabled={line.locked}
                    onClick={() => onDecrement(line.id)}
                    className={POS_ICON_ACTION}
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium text-foreground">
                    {line.units}
                  </span>
                  <button
                    type="button"
                    aria-label={copy.increase}
                    disabled={line.locked}
                    onClick={() => onIncrement(line.id)}
                    className={POS_ICON_ACTION}
                  >
                    +
                  </button>
                </div>
                <span className="w-20 shrink-0 text-right text-sm font-medium text-foreground">
                  {formatOrderMoney(lineTotal, currency)}
                </span>
                <button
                  type="button"
                  aria-label={copy.remove}
                  disabled={line.locked}
                  onClick={() => onRemove(line.id)}
                  className={cn(POS_ICON_ACTION, "text-destructive")}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="pos-discount-code">
          {copy.discountLabel}
        </label>
        <div className="flex gap-2">
          <input
            id="pos-discount-code"
            type="text"
            className={POS_INPUT}
            placeholder={copy.discountPlaceholder}
            value={discountCode}
            onChange={(event) => onDiscountCodeChange(event.target.value)}
          />
          <button
            type="button"
            disabled={discountApplying || discountCode.trim().length === 0}
            onClick={onApplyDiscount}
            className={cn(POS_SECONDARY_ACTION, "h-11 px-4")}
          >
            {copy.applyDiscount}
          </button>
        </div>
        {discountNotCombinable && (
          <p role="alert" className="text-xs text-destructive">
            {copy.discountNotCombinable}
          </p>
        )}
      </div>

      <dl className="space-y-1 border-t border-border pt-3">
        <div className="flex justify-between text-sm text-muted-foreground">
          <dt>{copy.subtotal}</dt>
          <dd>{formatOrderMoney(totals.subtotalCents, currency)}</dd>
        </div>
        {totals.discountCents > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <dt>{copy.discount}</dt>
            <dd>−{formatOrderMoney(totals.discountCents, currency)}</dd>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold text-foreground">
          <dt>{copy.total}</dt>
          <dd>{formatOrderMoney(totals.totalCents, currency)}</dd>
        </div>
      </dl>

      {isEmpty && <p className="text-xs text-muted-foreground">{copy.chargeEmptyHint}</p>}

      <button
        type="button"
        disabled={chargeDisabled}
        onClick={onCharge}
        className={cn(POS_PRIMARY_ACTION, "w-full")}
      >
        {chargeLoading ? copy.chargeLoading : `${copy.charge} · ${formatOrderMoney(totals.totalCents, currency)}`}
      </button>
    </div>
  );
}
