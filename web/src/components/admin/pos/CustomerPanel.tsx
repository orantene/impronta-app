"use client";

/**
 * CustomerPanel — C06–C10's optional customer attachment. Defaults to
 * walk-in (`customer === null`): the sale is real and sellable without a
 * name, per the engine's own rule (`no_contact` only fires at collection —
 * see `lib/pos/collection.ts`), so this panel never blocks anything on its
 * own, it only offers to attach someone.
 *
 * C10's retry rule — a failed attach retries against the SAME customer id,
 * never inserting a second record for the same person — is the caller's
 * job (it owns the id); this panel just exposes `onRetryAttach` as a
 * distinct action from `onCreate` so that rule is easy to honour.
 */

import { cn } from "@/lib/utils";
import { POS_INPUT, POS_SECONDARY_ACTION, POS_SURFACE } from "./pos-classes";
import type { PosAttachedCustomer } from "./pos-types";

export type CustomerPanelCopy = {
  readonly title: string;
  readonly walkIn: string;
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly create: string;
  readonly attach: string;
  readonly attachRetry: string;
  readonly none: string;
};

export type CustomerPanelProps = {
  readonly customer: PosAttachedCustomer | null;
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchResults?: readonly PosAttachedCustomer[];
  readonly onSelectResult: (customerId: string) => void;
  readonly onCreateNew: () => void;
  /** Set once C10's attach failure has happened — same customer id, no dup. */
  readonly attachFailed?: boolean;
  readonly onRetryAttach?: () => void;
  readonly copy: CustomerPanelCopy;
  readonly className?: string;
};

export function CustomerPanel({
  customer,
  searchValue,
  onSearchChange,
  searchResults = [],
  onSelectResult,
  onCreateNew,
  attachFailed,
  onRetryAttach,
  copy,
  className,
}: CustomerPanelProps) {
  return (
    <div className={cn(POS_SURFACE, "flex flex-col gap-3 p-4", className)}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {copy.title}
      </h3>

      {customer ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{customer.displayName}</p>
            {(customer.email || customer.phone) && (
              <p className="truncate text-xs text-muted-foreground">
                {[customer.email, customer.phone].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          {attachFailed && (
            <button type="button" onClick={onRetryAttach} className={cn(POS_SECONDARY_ACTION, "h-9 px-3 text-xs")}>
              {copy.attachRetry}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-foreground">{copy.walkIn}</p>
      )}

      <label className="sr-only" htmlFor="pos-customer-search">
        {copy.search}
      </label>
      <input
        id="pos-customer-search"
        type="text"
        className={POS_INPUT}
        placeholder={copy.searchPlaceholder}
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      {searchResults.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {searchResults.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => onSelectResult(result.id)}
                className="flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-accent"
              >
                <span className="text-sm text-foreground">{result.displayName}</span>
                {(result.email || result.phone) && (
                  <span className="text-xs text-muted-foreground">
                    {[result.email, result.phone].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {searchValue.trim().length > 0 && searchResults.length === 0 && (
        <p className="text-xs text-muted-foreground">{copy.none}</p>
      )}

      <button type="button" onClick={onCreateNew} className={cn(POS_SECONDARY_ACTION, "h-11")}>
        {copy.create}
      </button>
    </div>
  );
}
