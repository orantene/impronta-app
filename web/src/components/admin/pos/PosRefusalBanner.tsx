"use client";

/**
 * PosRefusalBanner — the five refusals the Counter must be able to show, in
 * plain words a cashier understands, because the engine really returns
 * these (task spec, "THE REFUSALS THE SCREEN MUST BE ABLE TO SHOW"):
 *
 *   balanceChanged    — `lib/pos/collection.ts`'s `reason: "amount"` when an
 *                        allocation now exceeds what is outstanding: someone
 *                        else already collected part of this balance.
 *   saleReloading     — the `orders.version` optimistic-concurrency conflict
 *                        (draft.ts / collection.ts `reason: "conflict"`).
 *   needsCustomerName — `reason: "no_contact"`: collecting money needs an
 *                        email or a phone before the sale can be sold.
 *   paymentDeclined   — M07, card declined: sale is intact, retry available.
 *   paymentUnknown    — M06, outcome unknown: a new payment attempt must not
 *                        be offered until this one resolves (money.md §4).
 *
 * One banner, one reason, one sentence — never a generic "something went
 * wrong". `role="alert"` so a cashier's screen reader announces it the
 * moment it appears.
 */

import { cn } from "@/lib/utils";
import { POS_REFUSAL_BANNER, POS_SECONDARY_ACTION } from "./pos-classes";
import type { PosRefusalReason } from "./pos-types";

export type PosRefusalCopy = {
  readonly balanceChanged: string;
  readonly saleReloading: string;
  readonly needsCustomerName: string;
  readonly paymentDeclined: string;
  readonly paymentUnknown: string;
  readonly retry: string;
  readonly reload: string;
};

export type PosRefusalBannerProps = {
  readonly reason: PosRefusalReason;
  readonly copy: PosRefusalCopy;
  /** Only declined/unknown payments and a stale sale offer a next action. */
  readonly onRetry?: () => void;
  readonly className?: string;
};

const ACTION_LABEL_KEY: Partial<Record<PosRefusalReason, keyof PosRefusalCopy>> = {
  saleReloading: "reload",
  paymentDeclined: "retry",
};

export function PosRefusalBanner({ reason, copy, onRetry, className }: PosRefusalBannerProps) {
  const sentence = copy[reason];
  const actionKey = ACTION_LABEL_KEY[reason];

  return (
    <div role="alert" className={cn(POS_REFUSAL_BANNER, className)}>
      <p className="flex-1">{sentence}</p>
      {actionKey && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(POS_SECONDARY_ACTION, "h-9 shrink-0 px-3 text-xs")}
        >
          {copy[actionKey]}
        </button>
      )}
    </div>
  );
}
