"use client";

/**
 * Basket — the right column of `POSCounter`: `Customer · Booking · Here|To
 * go` across the top, one row per line (quantity pill, name, modifiers,
 * `Held until` chip, price and `$x each`), then `Subtotal / Discount / Tax /
 * Total`, the forest `Charge $485`, `Hold sale · Send N items`, and the
 * `Saved 09:58` line. Empty (`POSEmptySale`): the bag icon, `Nothing in this
 * sale yet`, the sentence, and the `Held sales · N` door.
 *
 * Totals are never computed inline here; `basketTotals` (pos-math.ts) wraps
 * the engine's own `cartTotals`, so this screen agrees with the write path
 * on every cent by construction.
 *
 * A line is a button: tapping it opens the line editor (`POSLineEdit`). The
 * Discount row is a button too (`POSDiscount`). Every write is the caller's.
 */

import { Calendar, ShoppingBag, User } from "lucide-react";

import { interpolate as fill } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { lineTotalCents } from "@/lib/cart/totals";
import { cn } from "@/lib/utils";
import { basketTotals } from "./pos-math";
import {
  POS_NUM,
  POS_PILL,
  POS_PILL_CORAL,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
  POS_SEGMENT,
  POS_SEGMENT_ACTIVE,
  POS_SEGMENT_IDLE,
  POS_SEGMENT_TRACK,
  POS_TOTAL_ROW,
} from "./pos-classes";
import type { PosBasketLine } from "./pos-types";

export type BasketCopy = {
  readonly title: string;
  readonly customer: string;
  readonly booking: string;
  readonly here: string;
  readonly toGo: string;
  readonly emptyTitle: string;
  readonly empty: string;
  /** `Held sales · {count}` */
  readonly heldSales: string;
  /** `Basket · {count} items` (the portrait sheet's header). */
  readonly basketCount: string;
  /** `{amount} each` */
  readonly each: string;
  /** `Held until {time}` */
  readonly heldUntil: string;
  readonly editLine: string;
  readonly subtotal: string;
  readonly discount: string;
  readonly tax: string;
  readonly taxNone: string;
  readonly total: string;
  /** `Charge {amount}`; with no amount, plain `Charge`. */
  readonly charge: string;
  readonly chargeCash: string;
  readonly chargeLoading: string;
  readonly hold: string;
  /** `Send {count} items` */
  readonly send: string;
  readonly sendOne: string;
  /** `Send again · {count} items` */
  readonly sendAgain: string;
  readonly cardOffline: string;
  /** `Saved {time}` */
  readonly saved: string;
  readonly savedOffline: string;
};

export type BasketProps = {
  readonly lines: readonly PosBasketLine[];
  readonly currency: string;
  /** Already-resolved discount, in cents — 0 when none is applied. */
  readonly discountCents?: number;
  readonly customerName: string | null;
  readonly onOpenCustomer: () => void;
  readonly onOpenBooking: () => void;
  readonly service: "here" | "toGo";
  readonly onServiceChange: (service: "here" | "toGo") => void;
  readonly onEditLine: (lineId: string) => void;
  readonly onOpenDiscount: () => void;
  readonly onCharge: () => void;
  readonly onHold: () => void;
  /** The `Send N items` action: `null` when there is no sale to send. */
  readonly onSend: (() => void) | null;
  /** True once a ticket has gone: the action reads `Send again` (an amendment). */
  readonly sentBefore: boolean;
  readonly heldCount: number;
  readonly onOpenHeld: () => void;
  readonly chargeLoading?: boolean;
  readonly offline?: boolean;
  /** Wall-clock time of the last accepted write, already formatted. */
  readonly savedAt: string | null;
  /** Whether a sale is open at all; with none, the column is the empty state. */
  readonly hasSale: boolean;
  readonly copy: BasketCopy;
  readonly className?: string;
};

export function Basket({
  lines,
  currency,
  discountCents = 0,
  customerName,
  onOpenCustomer,
  onOpenBooking,
  service,
  onServiceChange,
  onEditLine,
  onOpenDiscount,
  onCharge,
  onHold,
  onSend,
  sentBefore,
  heldCount,
  onOpenHeld,
  chargeLoading,
  offline,
  savedAt,
  hasSale,
  copy,
  className,
}: BasketProps) {
  const totals = basketTotals(lines, discountCents);
  const isEmpty = lines.length === 0;
  const chargeDisabled = isEmpty || Boolean(chargeLoading) || Boolean(offline);
  const unsent = lines.filter((line) => !line.locked).length;
  const totalLabel = formatOrderMoney(totals.totalCents, currency);

  return (
    <aside
      data-pos-basket
      aria-label={copy.title}
      className={cn(
        "flex h-full min-h-0 w-[420px] shrink-0 flex-col border-l border-admin-border bg-admin-card",
        "max-[900px]:h-auto max-[900px]:max-h-[46%] max-[900px]:w-full max-[900px]:border-l-0 max-[900px]:border-t max-[900px]:shadow-[0_-6px_18px_rgba(11,11,13,0.06)]",
        className,
      )}
    >
      <div className="hidden items-center gap-2 border-b border-admin-border px-4 py-3 max-[900px]:flex">
        <span className="flex-1 text-[15px] font-semibold text-admin-ink">
          {isEmpty ? copy.emptyTitle : fill(copy.basketCount, { count: lines.length })}
        </span>
        <button type="button" onClick={onOpenCustomer} aria-label={customerName ?? copy.customer} className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border-[1.5px] border-admin-border text-admin-ink">
          <User aria-hidden size={18} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={onOpenBooking} aria-label={copy.booking} className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border-[1.5px] border-admin-border text-admin-ink">
          <Calendar aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-admin-border px-3.5 py-3 max-[900px]:hidden">
        <button
          type="button"
          data-pos-open-customer
          onClick={onOpenCustomer}
          className={cn(POS_SECONDARY_ACTION, "h-11 max-w-[170px] rounded-[11px] px-3 text-[14px]")}
        >
          <User aria-hidden size={18} strokeWidth={1.75} />
          <span className="truncate">{customerName ?? copy.customer}</span>
        </button>
        <button
          type="button"
          data-pos-open-booking
          onClick={onOpenBooking}
          className={cn(POS_SECONDARY_ACTION, "h-11 rounded-[11px] px-3 text-[14px]")}
        >
          <Calendar aria-hidden size={18} strokeWidth={1.75} />
          {copy.booking}
        </button>
        <span className="flex-1" />
        <div className={POS_SEGMENT_TRACK} role="group" aria-label={`${copy.here} / ${copy.toGo}`}>
          <button
            type="button"
            aria-pressed={service === "here"}
            onClick={() => onServiceChange("here")}
            className={cn(POS_SEGMENT, service === "here" ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
          >
            {copy.here}
          </button>
          <button
            type="button"
            aria-pressed={service === "toGo"}
            onClick={() => onServiceChange("toGo")}
            className={cn(POS_SEGMENT, service === "toGo" ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
          >
            {copy.toGo}
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center max-[900px]:hidden">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-admin-surface-alt text-admin-ink-muted">
            <ShoppingBag aria-hidden size={26} strokeWidth={1.75} />
          </span>
          <p data-pos-empty className="m-0 text-[17px] font-semibold text-admin-ink">{copy.emptyTitle}</p>
          <p className="m-0 max-w-[300px] text-[14px] leading-relaxed text-admin-ink-muted">{copy.empty}</p>
          {heldCount > 0 && (
            <button type="button" data-pos-open-held onClick={onOpenHeld} className={cn(POS_SECONDARY_ACTION, "h-11 text-[14px]")}>
              {fill(copy.heldSales, { count: heldCount })}
            </button>
          )}
        </div>
      ) : (
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 max-[900px]:max-h-[220px] max-[900px]:min-h-[64px]">
          {lines.map((line) => {
            const lineTotal = lineTotalCents(line);
            const detail = [line.variantLabel, line.sessionLabel, line.notes].filter(Boolean).join(" · ");
            return (
              <li key={line.id} className="border-t border-admin-border-soft first:border-t-0">
                <button
                  type="button"
                  data-pos-line={line.id}
                  aria-label={`${copy.editLine}: ${line.label}`}
                  onClick={() => onEditLine(line.id)}
                  className="flex w-full items-center gap-3 px-4 py-[13px] text-left transition-colors hover:bg-admin-surface-alt/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-admin-brand"
                >
                  <span
                    className={cn(
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-bold text-admin-ink",
                      POS_NUM,
                    )}
                  >
                    {line.units}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-admin-ink">{line.label}</span>
                    {detail && <span className="mt-0.5 block text-[14.5px] text-admin-ink-muted">{detail}</span>}
                  </span>
                  {line.heldUntil && (
                    <span className={cn(POS_PILL, POS_PILL_CORAL, "px-[11px] py-[5px] text-[13.5px]")}>
                      {fill(copy.heldUntil, { time: line.heldUntil })}
                    </span>
                  )}
                  <span className="shrink-0 text-right">
                    <span className={cn("block text-[16.5px] font-bold text-admin-ink", POS_NUM)}>
                      {formatOrderMoney(lineTotal, currency)}
                    </span>
                    {line.units > 1 && (
                      <span className={cn("block text-[13px] text-admin-ink-dim", POS_NUM)}>
                        {fill(copy.each, { amount: formatOrderMoney(line.unitCents, currency) })}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-admin-border">
        {!isEmpty && (
          <>
            <dl className="m-0 px-4 pt-2.5 max-[900px]:hidden">
              <div className={POS_TOTAL_ROW}>
                <dt className="text-admin-ink-muted">{copy.subtotal}</dt>
                <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>
                  {formatOrderMoney(totals.subtotalCents, currency)}
                </dd>
              </div>
              <div className={POS_TOTAL_ROW}>
                <dt className="text-admin-ink-muted">
                  <button
                    type="button"
                    data-pos-open-discount
                    onClick={onOpenDiscount}
                    className="rounded text-admin-ink-muted underline-offset-4 hover:text-admin-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand"
                  >
                    {copy.discount}
                  </button>
                </dt>
                <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>
                  {totals.discountCents > 0 ? `−${formatOrderMoney(totals.discountCents, currency)}` : "—"}
                </dd>
              </div>
              <div className={POS_TOTAL_ROW}>
                <dt className="text-admin-ink-muted">{copy.tax}</dt>
                <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>
                  {totals.taxCents > 0 ? formatOrderMoney(totals.taxCents, currency) : copy.taxNone}
                </dd>
              </div>
            </dl>
            <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-2.5">
              <span className="text-[17px] font-bold text-admin-ink">{copy.total}</span>
              <span data-pos-total className={cn("text-[30px] font-bold tracking-[-0.025em] text-admin-ink", POS_NUM)}>
                {totalLabel}
              </span>
            </div>
          </>
        )}
        <div className="flex flex-col gap-2 px-4 pb-4 pt-2.5">
          <button
            type="button"
            data-pos-charge
            disabled={chargeDisabled}
            onClick={onCharge}
            className={cn(POS_PRIMARY_ACTION, "h-[60px] w-full")}
          >
            {chargeLoading
              ? copy.chargeLoading
              : isEmpty
                ? fill(copy.charge, { amount: "" }).trim()
                : fill(offline ? copy.chargeCash : copy.charge, { amount: totalLabel })}
          </button>
          {!isEmpty && hasSale && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" data-pos-hold onClick={onHold} className={POS_SECONDARY_ACTION}>
                {copy.hold}
              </button>
              {offline ? (
                <button type="button" disabled className={POS_SECONDARY_ACTION}>
                  {copy.cardOffline}
                </button>
              ) : (
                <button type="button" data-pos-send disabled={!onSend || chargeLoading} onClick={onSend ?? undefined} className={POS_SECONDARY_ACTION}>
                  {sentBefore ? fill(copy.sendAgain, { count: unsent }) : unsent === 1 ? copy.sendOne : fill(copy.send, { count: unsent })}
                </button>
              )}
            </div>
          )}
          {!isEmpty && (
            <p className="m-0 text-center text-[13px] text-admin-ink-dim">
              {offline ? copy.savedOffline : savedAt ? fill(copy.saved, { time: savedAt }) : ""}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
