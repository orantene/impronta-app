"use client";

/**
 * HeldSalesList — C16/C21's held-sale rail: park a draft, resume it later.
 * The draft `orders` row itself never expires on its own (spec §3, C16–C17)
 * — a held CLASS PLACE inside it can, which is `PosRefusalBanner`'s
 * "saleReloading"/held-place-expired territory, not this list's.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { POS_NUM, POS_SECONDARY_ACTION, POS_SURFACE } from "./pos-classes";
import type { PosHeldSale } from "./pos-types";

export type HeldSalesListCopy = {
  readonly title: string;
  readonly empty: string;
  readonly resume: string;
  readonly heldSince: string;
  /** "from Messages": the row's origin pill when the draft came from a conversation. */
  readonly fromMessages: string;
};

export type HeldSalesListProps = {
  readonly sales: readonly PosHeldSale[];
  readonly onResume: (orderId: string) => void;
  readonly copy: HeldSalesListCopy;
  readonly className?: string;
};

export function HeldSalesList({ sales, onResume, copy, className }: HeldSalesListProps) {
  return (
    <div data-pos-held className={cn("flex flex-col gap-3", className)}>
      {sales.length === 0 ? (
        <p role="status" className={cn(POS_SURFACE, "m-0 px-5 py-6 text-center text-[15px] text-admin-ink-muted")}>
          {copy.empty}
        </p>
      ) : (
        <ul className={cn(POS_SURFACE, "m-0 list-none overflow-hidden p-0")}>
          {sales.map((sale) => (
            <li
              key={sale.orderId}
              data-pos-held-sale={sale.orderId}
              className="flex min-h-[64px] items-center gap-4 border-b border-admin-border-soft px-4 py-3 last:border-b-0"
            >
              <span className={cn("w-[82px] font-mono text-[15px] text-admin-ink-muted", POS_NUM)}>{sale.heldAt}</span>
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-admin-ink">
                {sale.label}
                {sale.origin === "messages" && (
                  <span data-pos-sale-origin="messages" className="ml-2 rounded-full bg-admin-brand-soft px-2 py-0.5 text-[11.5px] font-semibold text-admin-brand">
                    {copy.fromMessages}
                  </span>
                )}
              </span>
              <span className={cn("font-mono text-[15px] font-bold text-admin-ink", POS_NUM)}>
                {formatOrderMoney(sale.totalCents, sale.currency)}
              </span>
              <button type="button" onClick={() => onResume(sale.orderId)} className={cn(POS_SECONDARY_ACTION, "h-11 px-4 text-[14px]")}>
                {copy.resume}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
