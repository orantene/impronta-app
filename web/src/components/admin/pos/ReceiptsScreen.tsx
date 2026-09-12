"use client";

/**
 * ReceiptsScreen — M14, `POSReceipts`: the search box, the `Today ·
 * Yesterday · This week` segmented control, the `All · Cash · Card ·
 * Refunds` one, and one row per paid sale: time, `#code`, customer, summary,
 * amount, method, chevron.
 *
 * Rows are the workspace's own paid counter sales (`listPaidPosSales`). The
 * `Cash · Card · Refunds` filters need the money row's method, which that
 * reader does not carry, so they are drawn disabled with a sentence
 * (D-POS-27); `All` is live. A row opens the receipt page (`/r/<code>`), the
 * same page a customer holds.
 */

import { ChevronRight, Search } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { POS_NUM, POS_SEGMENT, POS_SEGMENT_ACTIVE, POS_SEGMENT_IDLE, POS_SEGMENT_TRACK } from "./pos-classes";

export type PosReceiptRow = {
  readonly orderId: string;
  readonly code: string | null;
  readonly time: string;
  readonly dayKey: "today" | "yesterday" | "week";
  readonly customer: string | null;
  readonly summary: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly href: string | null;
  /** `messages`: the sale was opened from a conversation and paid by link (seam 3). */
  readonly origin?: "pos" | "messages";
};

export type ReceiptsCopy = {
  readonly title: string;
  /** `{day} · {count} sales · {total}` */
  readonly subtitle: string;
  readonly searchPlaceholder: string;
  readonly searchLabel: string;
  readonly today: string;
  readonly yesterday: string;
  readonly week: string;
  readonly all: string;
  readonly cash: string;
  readonly card: string;
  readonly refunds: string;
  readonly methodUnavailable: string;
  readonly walkIn: string;
  readonly empty: string;
  readonly noCode: string;
  readonly open: string;
  /** "from Messages · paid by link" */
  readonly fromMessages: string;
};

export type ReceiptsScreenProps = {
  readonly rows: readonly PosReceiptRow[];
  readonly day: "today" | "yesterday" | "week";
  readonly onDayChange: (day: "today" | "yesterday" | "week") => void;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly copy: ReceiptsCopy;
};

export function receiptsSubtitle(copy: ReceiptsCopy, rows: readonly PosReceiptRow[], day: "today" | "yesterday" | "week", currency: string): string {
  const dayLabel = day === "today" ? copy.today : day === "yesterday" ? copy.yesterday : copy.week;
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0);
  return interpolate(copy.subtitle, { day: dayLabel, count: rows.length, total: formatOrderMoney(total, currency) });
}

export function ReceiptsScreen({ rows, day, onDayChange, query, onQueryChange, copy }: ReceiptsScreenProps) {
  const needle = query.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (row.dayKey !== day && !(day === "week")) return false;
    if (!needle) return true;
    return (
      (row.customer ?? "").toLowerCase().includes(needle) ||
      (row.code ?? "").toLowerCase().includes(needle) ||
      row.summary.toLowerCase().includes(needle) ||
      formatOrderMoney(row.totalCents, row.currency).includes(needle)
    );
  });

  return (
    <div data-pos-receipts className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
      <div className="flex items-center gap-4">
        <div className="flex h-[52px] flex-1 items-center gap-2.5 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4">
          <Search aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-admin-ink-dim" />
          <label className="sr-only" htmlFor="pos-receipts-search">
            {copy.searchLabel}
          </label>
          <input
            id="pos-receipts-search"
            type="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-admin-ink outline-none placeholder:text-admin-ink-dim"
            placeholder={copy.searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
        <div className={POS_SEGMENT_TRACK} role="tablist" aria-label={copy.title}>
          {(["today", "yesterday", "week"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={day === key}
              onClick={() => onDayChange(key)}
              className={cn(POS_SEGMENT, "h-11 px-4 text-[15px]", day === key ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
            >
              {key === "today" ? copy.today : key === "yesterday" ? copy.yesterday : copy.week}
            </button>
          ))}
        </div>
        <div className={POS_SEGMENT_TRACK} role="group" aria-label={copy.all}>
          <span className={cn(POS_SEGMENT, "h-11 px-3.5", POS_SEGMENT_ACTIVE)}>{copy.all}</span>
          {[copy.cash, copy.card, copy.refunds].map((label) => (
            <button key={label} type="button" disabled title={copy.methodUnavailable} className={cn(POS_SEGMENT, "h-11 px-3.5", POS_SEGMENT_IDLE)}>
              {label}
              <span className="sr-only">{copy.methodUnavailable}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p role="status" className="m-0 mt-5 rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-5 py-6 text-center text-[15px] text-admin-ink-muted">
          {copy.empty}
        </p>
      ) : (
        <ul className="m-0 mt-5 list-none overflow-hidden rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-0">
          {visible.map((row) => {
            const inner = (
              <>
                <span className={cn("w-[82px] font-mono text-[15px] text-admin-ink-muted", POS_NUM)}>{row.time}</span>
                <span className={cn("w-[112px] font-mono text-[15px] font-bold text-admin-ink", POS_NUM)}>
                  {row.code ? `#${row.code.slice(0, 6)}` : copy.noCode}
                </span>
                <span className="w-[165px] truncate text-[16px] font-semibold text-admin-ink">{row.customer ?? copy.walkIn}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] text-admin-ink-muted">
                  {row.summary}
                  {row.origin === "messages" && (
                    <span data-pos-sale-origin="messages" className="ml-2 rounded-full bg-admin-brand-soft px-2 py-0.5 text-[11.5px] font-semibold text-admin-brand">
                      {copy.fromMessages}
                    </span>
                  )}
                </span>
                <span className={cn("w-[120px] font-mono text-[15px] font-bold text-admin-ink", POS_NUM)}>
                  {formatOrderMoney(row.totalCents, row.currency)}
                </span>
                <ChevronRight aria-hidden size={18} strokeWidth={1.75} className="text-admin-ink-dim" />
              </>
            );
            return (
              <li key={row.orderId} data-pos-receipt-row={row.orderId} className="border-b border-admin-border-soft last:border-b-0">
                {row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${copy.open} ${row.code ?? row.orderId.slice(0, 8)}`}
                    className="flex min-h-[52px] items-center gap-4 px-4 py-3 hover:bg-admin-surface-alt"
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="flex min-h-[52px] items-center gap-4 px-4 py-3">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
