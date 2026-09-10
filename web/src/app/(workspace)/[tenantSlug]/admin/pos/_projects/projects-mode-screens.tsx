"use client";

/**
 * projects-mode-screens.tsx — two self-contained screens of the Collect mode,
 * split out of `projects-mode-client.tsx` so that file stays under the
 * repository's line budget. Pure presentation over props; every write and
 * every read stays in the client that owns the URL.
 */

import { useState } from "react";

import {
  POS_INPUT,
  POS_PRIMARY_ACTION,
  POS_REFUSAL_BANNER,
  POS_SECONDARY_ACTION,
  POS_SURFACE,
} from "@/components/admin/pos/pos-classes";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { isOrderStatus } from "@/lib/orders/order-status";

import type { ProjectsReceiptResult } from "./projects-actions";
import type { ProjectsModeCopy } from "./projects-copy";

function shortId(id: string): string {
  return id.slice(0, 8);
}

export type Collected = {
  amountCents: number;
  changeCents: number;
  outstandingAfterCents: number;
  receiptCode: string | null;
  currency: string;
};

/** The screen after a cash collection landed: amount, change, what is still owed, the receipt. */
export function CollectedPanel(props: {
  collected: Collected;
  mode: ProjectsModeCopy;
  receiptHrefFor: (code: string | null) => string | null;
  onBack: () => void;
}) {
  const { collected, mode, receiptHrefFor } = props;
  const [receiptCopied, setReceiptCopied] = useState(false);
  return (
    <div className={`${POS_SURFACE} flex flex-col gap-3 p-4`} data-pos-projects-collected>
      <h2 className="m-0 text-lg font-semibold text-foreground">{mode.paid.title}</h2>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.paid.amount}</dt>
          <dd className="m-0 text-xl font-semibold tabular-nums text-foreground" data-pos-projects-collected-amount>
            {formatOrderMoney(collected.amountCents, collected.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.paid.change}</dt>
          <dd className="m-0 text-xl font-semibold tabular-nums text-foreground">
            {formatOrderMoney(collected.changeCents, collected.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.paid.remaining}</dt>
          <dd className="m-0 text-xl font-semibold tabular-nums text-foreground" data-pos-projects-collected-remaining>
            {formatOrderMoney(collected.outstandingAfterCents, collected.currency)}
          </dd>
        </div>
      </dl>
      {collected.outstandingAfterCents === 0 && (
        <p className="m-0 text-sm text-muted-foreground">{mode.paid.settled}</p>
      )}
      {receiptHrefFor(collected.receiptCode) ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mode.paid.receipt}
          </p>
          <a
            href={receiptHrefFor(collected.receiptCode) ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            data-pos-receipt-link
            className="break-all text-sm text-foreground underline"
          >
            {receiptHrefFor(collected.receiptCode)}
          </a>
          <button
            type="button"
            className={`${POS_SECONDARY_ACTION} h-11`}
            onClick={() => {
              const link = receiptHrefFor(collected.receiptCode);
              if (!link) return;
              void navigator.clipboard?.writeText(link).then(
                () => setReceiptCopied(true),
                () => setReceiptCopied(false),
              );
            }}
          >
            {receiptCopied ? mode.paid.receiptCopied : mode.paid.copyReceipt}
          </button>
        </div>
      ) : (
        <p className="m-0 text-sm text-destructive">{mode.paid.noReceipt}</p>
      )}
      <button type="button" className={`${POS_PRIMARY_ACTION} w-full`} onClick={props.onBack}>
        {mode.paid.back}
      </button>
    </div>
  );
}

/** A receipt by its public code, inside this workspace. */
export function ReceiptsScreen(props: {
  mode: ProjectsModeCopy;
  busy: boolean;
  receiptCode: string;
  onReceiptCodeChange: (value: string) => void;
  receipt: ProjectsReceiptResult | null;
  onFind: () => void;
  receiptHrefFor: (code: string | null) => string | null;
}) {
  const { mode, busy, receiptCode, receipt, receiptHrefFor } = props;
  return (
    <div className="flex flex-col gap-3" data-pos-projects-receipts>
      <div className={`${POS_SURFACE} flex flex-col gap-2 p-4`}>
        <h2 className="m-0 text-base font-semibold text-foreground">{mode.receipts.title}</h2>
        <p className="m-0 text-sm text-muted-foreground">{mode.receipts.intro}</p>
        <label htmlFor="pos-projects-receipt-code" className="text-xs font-medium text-muted-foreground">
          {mode.receipts.codeLabel}
        </label>
        <input
          id="pos-projects-receipt-code"
          type="text"
          autoComplete="off"
          value={receiptCode}
          onChange={(event) => props.onReceiptCodeChange(event.target.value)}
          placeholder={mode.receipts.placeholder}
          className={`${POS_INPUT} h-14 font-mono text-base`}
        />
        <button
          type="button"
          className={`${POS_PRIMARY_ACTION} w-full`}
          disabled={busy}
          onClick={props.onFind}
        >
          {mode.receipts.find}
        </button>
      </div>
      {receipt && !receipt.ok && (
        <p role="alert" className={POS_REFUSAL_BANNER} data-pos-projects-receipt-refusal={receipt.reason}>
          {mode.receipts.refusal[receipt.reason]}
        </p>
      )}
      {receipt && receipt.ok && (
        <div className={`${POS_SURFACE} flex flex-col gap-3 p-4`} data-pos-projects-receipt={receipt.code}>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.receipts.record}</dt>
              <dd className="m-0 font-mono text-sm text-foreground">{shortId(receipt.orderId)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.receipts.status}</dt>
              <dd className="m-0 text-sm text-foreground">
                {isOrderStatus(receipt.status) ? mode.orderStatus[receipt.status] : receipt.status}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.receipts.total}</dt>
              <dd className="m-0 text-lg font-semibold tabular-nums text-foreground">
                {formatOrderMoney(receipt.totalCents, receipt.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{mode.receipts.collected}</dt>
              <dd className="m-0 text-lg font-semibold tabular-nums text-foreground">
                {formatOrderMoney(receipt.collectedCents, receipt.currency)}
              </dd>
            </div>
          </dl>
          {receiptHrefFor(receipt.code) && (
            <a
              href={receiptHrefFor(receipt.code) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`${POS_SECONDARY_ACTION} w-full`}
              data-pos-receipt-link
            >
              {mode.receipts.open}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
