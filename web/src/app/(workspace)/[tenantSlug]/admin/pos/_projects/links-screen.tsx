"use client";

/**
 * LinksScreen — `Payment links` (POSPaymentLink), the Links destination:
 * one row per link this workspace sent (`payment_links`, newest first):
 * who and what for, the amount, when it was sent and when it expires, its
 * state as a pill (`Opened · not paid` / `Paid` / `Expired` / `Cancelled`),
 * and one action per state: copy the link again (resending reuses the same
 * link and never creates a second charge), open the receipt once paid, or
 * open the sale to send a new link once it lapsed. The board's rule sits
 * under the list.
 */

import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";

import { POS_NOTE_INFO, POS_PILL, POS_PILL_CORAL, POS_PILL_GREEN, POS_PILL_SLATE, POS_SECONDARY_ACTION, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";

import type { ProjectsModeCopy } from "./projects-copy";

export type LinksScreenRow = {
  readonly code: string;
  readonly url: string;
  readonly orderId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: string;
  /** Already on the operator's clock. */
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly customerName: string | null;
  readonly title: string | null;
  readonly receiptHref: string | null;
};

export function LinksScreen({ copy, rows, saleHref }: { copy: ProjectsModeCopy; rows: readonly LinksScreenRow[]; saleHref: (orderId: string) => string }) {
  const b = copy.board;
  const [copied, setCopied] = useState<string | null>(null);
  const pill = (status: string) =>
    status === "paid" ? { tone: POS_PILL_GREEN, label: b.linkPaid } : status === "expired" ? { tone: POS_PILL_SLATE, label: b.linkExpired } : status === "cancelled" ? { tone: POS_PILL_SLATE, label: b.linkCancelled } : { tone: POS_PILL_CORAL, label: b.linkOpen };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-[18px]" data-pos-links>
      {rows.length === 0 ? (
        <div className={cn(POS_SURFACE, "flex flex-col items-center gap-2 px-5 py-8 text-center")}>
          <Link2 aria-hidden size={28} strokeWidth={1.5} className="text-admin-ink-dim" />
          <p role="status" className="m-0 max-w-[560px] text-[15px] text-admin-ink-muted" data-pos-links-empty>
            {b.linksEmpty}
          </p>
        </div>
      ) : (
        <ul className={cn(POS_SURFACE, "m-0 list-none divide-y divide-admin-border-soft p-0")}>
          {rows.map((row) => {
            const state = pill(row.status);
            const who = [row.customerName, row.title].filter((x): x is string => Boolean(x)).join(" · ") || interpolate(b.linkSale, { id: row.orderId.slice(0, 8) });
            return (
              <li key={row.code} className="flex flex-wrap items-center gap-3 px-4 py-3.5" data-pos-link-row={row.status}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-admin-ink">{who}</span>
                  <span className="block text-[13.5px] tabular-nums text-admin-ink-muted">
                    {formatOrderMoney(row.amountCents, row.currency)} · {interpolate(b.linkSent, { when: row.sentAt })}
                    {row.status === "open" ? ` · ${interpolate(b.linkExpires, { when: row.expiresAt })}` : ""}
                  </span>
                </span>
                <span className={cn(POS_PILL, state.tone, "px-[11px] py-[5px] text-[13px]")}>{state.label}</span>
                {row.status === "open" ? (
                  <button
                    type="button"
                    data-pos-link-copy={row.code}
                    className={POS_SECONDARY_ACTION}
                    onClick={() => {
                      void navigator.clipboard?.writeText(row.url).then(
                        () => setCopied(row.code),
                        () => setCopied(null),
                      );
                    }}
                  >
                    {copied === row.code ? <Check aria-hidden size={16} strokeWidth={1.75} /> : <Copy aria-hidden size={16} strokeWidth={1.75} />}
                    {copied === row.code ? b.linkCopied : b.linkResend}
                  </button>
                ) : row.status === "paid" && row.receiptHref ? (
                  <a href={row.receiptHref} target="_blank" rel="noopener noreferrer" className={POS_SECONDARY_ACTION}>
                    {b.linkReceipt}
                  </a>
                ) : (
                  <a href={saleHref(row.orderId)} className={POS_SECONDARY_ACTION}>
                    {b.linkNew}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className={cn(POS_NOTE_INFO, "m-0")}>{b.linksNote}</p>
    </div>
  );
}
