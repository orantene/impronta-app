"use client";

/**
 * HeldSalesList — C16/C21's held-sale rail: park a draft, resume it later.
 * The draft `orders` row itself never expires on its own (spec §3, C16–C17)
 * — a held CLASS PLACE inside it can, which is `PosRefusalBanner`'s
 * "saleReloading"/held-place-expired territory, not this list's.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { POS_SURFACE } from "./pos-classes";
import type { PosHeldSale } from "./pos-types";

export type HeldSalesListCopy = {
  readonly title: string;
  readonly empty: string;
  readonly resume: string;
  readonly heldSince: string;
};

export type HeldSalesListProps = {
  readonly sales: readonly PosHeldSale[];
  readonly onResume: (orderId: string) => void;
  readonly copy: HeldSalesListCopy;
  readonly className?: string;
};

export function HeldSalesList({ sales, onResume, copy, className }: HeldSalesListProps) {
  return (
    <div className={cn(POS_SURFACE, "flex flex-col gap-3 p-4", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {copy.title}
      </h2>
      {sales.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="space-y-2">
          {sales.map((sale) => (
            <li
              key={sale.orderId}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{sale.label}</p>
                <p className="text-xs text-muted-foreground">
                  {copy.heldSince} {sale.heldAt}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-medium text-foreground">
                  {formatOrderMoney(sale.totalCents, sale.currency)}
                </span>
                <button
                  type="button"
                  onClick={() => onResume(sale.orderId)}
                  className="flex h-11 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
                >
                  {copy.resume}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
