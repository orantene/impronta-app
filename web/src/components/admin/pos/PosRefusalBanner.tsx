"use client";

/**
 * PosRefusalBanner — every refusal the Counter must be able to show, in plain
 * words a cashier understands, because the engine really returns these. The
 * whole list is `POS_REFUSAL_REASONS` in `pos-types.ts` and the engine-side
 * mapping is `lib/pos/refusal-reason.ts`; the five below are the original
 * money-path ones and the rest carry the same contract:
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
 * The other fourteen cover the rest of the engine's vocabulary: a taken class
 * place (`sold_out`), a sale that is no longer open (`not_draft`), short cash,
 * an empty sale, a refused item or code, a code that needs a named customer,
 * a missing reader, a pickup time in the past, another workspace's sale, a
 * capability refusal, a bad amount, and the two shift states.
 *
 * One banner, one reason, one sentence — never a generic "something went
 * wrong". `role="alert"` so a cashier's screen reader announces it the
 * moment it appears.
 */

import { cn } from "@/lib/utils";
import { POS_REFUSAL_BANNER, POS_SECONDARY_ACTION } from "./pos-classes";
import type { PosRefusalReason } from "./pos-types";

/**
 * One sentence per reason, plus the two action labels.
 *
 * `Record<PosRefusalReason, string>` rather than a hand-listed set of fields:
 * a reason added to `POS_REFUSAL_REASONS` without its sentence is a compile
 * error at `refusalCopy`, which is where the catalogue lookup lives.
 */
export type PosRefusalCopy = Readonly<Record<PosRefusalReason, string>> & {
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

/**
 * Which refusals offer a next action, and which deliberately do not.
 *
 * `paymentUnknown` is the one that matters: money.md forbids offering another
 * attempt while an outcome is unresolved, so it is absent here on purpose and
 * must stay absent. `capacityGone`, `balanceChanged` and `bookingChanged` all
 * mean the sale on screen is stale, so they offer Reload rather than Try
 * again: retrying the same charge against changed facts is the mistake.
 */
const ACTION_LABEL_KEY: Partial<Record<PosRefusalReason, keyof PosRefusalCopy>> = {
  saleReloading: "reload",
  balanceChanged: "reload",
  bookingChanged: "reload",
  capacityGone: "reload",
  paymentDeclined: "retry",
};

export function PosRefusalBanner({ reason, copy, onRetry, className }: PosRefusalBannerProps) {
  const sentence = copy[reason];
  const actionKey = ACTION_LABEL_KEY[reason];

  return (
    // `data-pos-refusal` names WHICH refusal this is, beside the sentence that
    // says it. The page carries other `role="alert"` live regions that are
    // empty until something uses them, so "the first alert on the page" is not
    // a way to find this one — a browser journey looking for the counter's
    // refusal read one of those and saw an empty string. Same convention as
    // `data-pos-method-status` and `data-pos-receipt-link`: a hook that names
    // the thing, never a visible string a test has to parse.
    <div role="alert" data-pos-refusal={reason} className={cn(POS_REFUSAL_BANNER, className)}>
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

/**
 * The same banner for a Package 1 engine refusal: the code is the reason
 * word (`dashboard.pos.engine.refusal.*`) and the sentence arrives already
 * looked up, so a code this screen has never heard of still reads as the
 * catalogue's `unavailable` sentence and never as the word itself.
 */
export function PosEngineRefusalBanner({ code, sentence, onReload, reloadLabel, className }: { readonly code: string; readonly sentence: string; readonly onReload?: () => void; readonly reloadLabel?: string; readonly className?: string }) {
  return (
    <div role="alert" data-pos-refusal={code} className={cn(POS_REFUSAL_BANNER, className)}>
      <p className="flex-1">{sentence}</p>
      {code === "conflict" && onReload && reloadLabel && (
        <button type="button" onClick={onReload} className={cn(POS_SECONDARY_ACTION, "h-9 shrink-0 px-3 text-xs")}>
          {reloadLabel}
        </button>
      )}
    </div>
  );
}
