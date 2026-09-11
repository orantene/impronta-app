"use client";

/**
 * ShiftBar — M21–M23's drawer strip, shown across the counter regardless of
 * which internal destination is active. Copy keys reuse the existing
 * `dashboard.pos.shift*` catalogue entries rather than a second set under
 * `counter.*` — one bar, already named, one place its labels live.
 *
 * Movements and a denomination count are NOT rendered here on purpose:
 * money.md §3 records no movements/denominations table exists yet, so this
 * bar shows only the single running total `pos_shifts` actually has
 * (`openingCashCents`, and `countedCashCents`/`expectedCashCents` once a
 * close is in progress) rather than implying a ledger that is not there.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { POS_SECONDARY_ACTION } from "./pos-classes";
import type { PosShiftSummary } from "./pos-types";

export type ShiftBarCopy = {
  readonly shiftTitle: string;
  readonly shiftOpen: string;
  readonly shiftClose: string;
  readonly shiftOpening: string;
  readonly shiftCounted: string;
  readonly shiftExpected: string;
  readonly shiftVariance: string;
  readonly shiftNone: string;
  readonly shiftOpenHint: string;
};

export type ShiftBarProps = {
  readonly shift: PosShiftSummary | null;
  readonly currency: string;
  readonly onOpenShift: () => void;
  readonly onCloseShift: () => void;
  readonly copy: ShiftBarCopy;
  readonly className?: string;
};

export function ShiftBar({ shift, currency, onOpenShift, onCloseShift, copy, className }: ShiftBarProps) {
  if (!shift) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">{copy.shiftNone}</p>
        <button type="button" onClick={onOpenShift} className={cn(POS_SECONDARY_ACTION, "h-9 px-4 text-xs")}>
          {copy.shiftOpen}
        </button>
      </div>
    );
  }

  const hasCount = shift.countedCashCents != null && shift.expectedCashCents != null;
  const variance = hasCount
    ? (shift.countedCashCents as number) - (shift.expectedCashCents as number)
    : 0;

  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-2", className)}>
      <div className="flex items-center gap-4 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.shiftTitle}
        </span>
        <span className="text-foreground">
          {copy.shiftOpening} {formatOrderMoney(shift.openingCashCents, currency)}
        </span>
        {hasCount && (
          <>
            <span className="text-foreground">
              {copy.shiftCounted} {formatOrderMoney(shift.countedCashCents ?? 0, currency)}
            </span>
            <span className="text-foreground">
              {copy.shiftExpected} {formatOrderMoney(shift.expectedCashCents ?? 0, currency)}
            </span>
            <span className={variance === 0 ? "text-foreground" : "text-destructive"}>
              {copy.shiftVariance} {formatOrderMoney(variance, currency)}
            </span>
          </>
        )}
      </div>
      <button type="button" onClick={onCloseShift} className={cn(POS_SECONDARY_ACTION, "h-9 px-4 text-xs")}>
        {copy.shiftClose}
      </button>
    </div>
  );
}
