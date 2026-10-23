"use client";

/**
 * Orders desk — the real (non-mock) order detail view.
 *
 * QA bounce (#2963, #3994 history): opening an order from the live desk gave
 * no organized detail at all. A row either linked straight to the message
 * thread (losing the order) or, for a handful of statuses, showed a bare
 * refund form bolted onto the status cell. Nothing laid out the customer,
 * the items/totals and the payment state together.
 *
 * This is a DISPLAY reorganization only: every value rendered here already
 * exists on `OrderListRow` (fetched by `_data-bridge/orders.ts`), none of it
 * is recomputed. Clicking a row expands a panel, grouped the way the other
 * detail surfaces in this app group things (see
 * `AgendaBookingRecord.tsx`'s header + `<dl>` facts pattern): Customer, Items
 * and totals, Payment and status, Order info. The conversation link that used
 * to BE the whole "detail" experience now lives inside Order info instead of
 * hijacking the row's click.
 *
 * Deliberately separate from `orders-door-mock-list.tsx` (TUL-434 slice 1):
 * that file is an opt-in (`?door=preview`) mockup explicitly held for Oran's
 * look pass, with placeholder section bodies. This component is the real,
 * always-on replacement for the default desk and touches no money logic.
 */

import { Fragment, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { orderLineItemsLabel, outstandingCents, type OrderListRow } from "@/lib/orders/orders-list";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { salesChannelLabel, type SalesLocale } from "@/lib/sales/activity-shape";
import { OrdersRefundForm, type RefundFormCopy } from "./orders-refund-form";

export type OrderRowDetailCopy = {
  readonly colOrder: string;
  readonly colCustomer: string;
  readonly colChannel: string;
  readonly colTotal: string;
  readonly colOutstanding: string;
  readonly colStatus: string;
  readonly lineCountOne: string;
  readonly lineCountOther: string;
  readonly noCustomer: string;
  readonly openThread: string;
  readonly viewDetails: string;
  readonly hideDetails: string;
  readonly sectionCustomer: string;
  readonly sectionItems: string;
  readonly sectionPayment: string;
  readonly sectionInfo: string;
  readonly orderIdLabel: string;
  readonly placedLabel: string;
  readonly collectedLabel: string;
  readonly noEmail: string;
  readonly noThread: string;
  readonly status: Readonly<Record<string, string>>;
};

type Props = {
  readonly rows: readonly OrderListRow[];
  readonly locale: string;
  readonly copy: OrderRowDetailCopy;
  readonly refundCopy: RefundFormCopy;
  /** inquiryId -> href. Built server-side; absent inquiries are just omitted. */
  readonly threadHrefByInquiry: Readonly<Record<string, string>>;
  readonly variant: "desktop" | "mobile";
};

// Exported for direct unit testing (order-row-detail.test.ts) — each is pure
// and small enough to pin without rendering the whole list.

export function statusLabel(status: string, copy: OrderRowDetailCopy): string {
  return copy.status[status] ?? status;
}

/** Same mapping the desk used before this change (pending_payment/paid/other). */
export function statusPillClasses(row: Pick<OrderListRow, "status">): string {
  if (row.status === "pending_payment") return "bg-admin-coral-soft text-admin-coral-deep";
  if (row.status === "paid") return "bg-admin-success-soft text-admin-green";
  return "bg-admin-amber-soft text-admin-amber";
}

export function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === "es" ? "es-MX" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Can this order show the refund form — same condition the desk used before this change. */
export function showsRefund(status: string): boolean {
  return status === "paid" || status === "partially_refunded";
}

/** "1 item" / "2 items" (TUL-435) — never a bare, unpluralized noun. */
export function lineCountLabel(count: number, copy: OrderRowDetailCopy): string {
  return orderLineItemsLabel(count, copy.lineCountOne, copy.lineCountOther);
}

export function OrdersList({ rows, locale, copy, refundCopy, threadHrefByInquiry, variant }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const channelLocale: SalesLocale = locale === "es" || locale === "fr" ? locale : "en";
  const channelLabel = (raw: string) => salesChannelLabel(raw, channelLocale);
  const money = (cents: number, currency: string) => formatDashboardMoneyCents(cents, currency, locale);

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(id);
    }
  };

  if (variant === "desktop") {
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr className="text-left text-admin-ink-muted text-[12px]">
            <th style={{ padding: "10px 8px", fontWeight: 500, width: 24 }} aria-hidden />
            <th style={{ padding: "10px 12px", fontWeight: 500 }}>{copy.colOrder}</th>
            <th style={{ padding: "10px 12px", fontWeight: 500 }}>{copy.colCustomer}</th>
            <th style={{ padding: "10px 12px", fontWeight: 500 }}>{copy.colChannel}</th>
            <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>{copy.colTotal}</th>
            <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>{copy.colOutstanding}</th>
            <th style={{ padding: "10px 12px", fontWeight: 500 }}>{copy.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const owed = outstandingCents(row);
            const open = openId === row.id;
            return (
              <Fragment key={row.id}>
                <tr
                  className="border-t border-admin-border"
                  style={{ background: open ? "var(--color-admin-surface)" : undefined, cursor: "pointer" }}
                  aria-expanded={open}
                  aria-label={open ? copy.hideDetails : copy.viewDetails}
                  tabIndex={0}
                  onClick={() => toggle(row.id)}
                  onKeyDown={(e) => onKey(e, row.id)}
                  data-testid={`orders-row-${row.id}`}
                >
                  <td style={{ padding: "12px 8px", width: 24 }}>
                    <ChevronDown
                      className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </td>
                  <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums" }}>
                    {row.id.slice(0, 8).toUpperCase()}
                    <div className="text-admin-ink-dim text-[12px]">
                      {lineCountLabel(row.lineCount, copy)}
                    </div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    {row.customerName ?? <span className="text-admin-ink-dim">{copy.noCustomer}</span>}
                    {row.customerEmail ? (
                      <div className="text-admin-ink-dim text-[12px]">{row.customerEmail}</div>
                    ) : null}
                  </td>
                  <td style={{ padding: "12px" }} className="text-admin-ink-muted">
                    {channelLabel(row.sourceChannel)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {money(row.totalCents, row.currency)}
                  </td>
                  <td
                    style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    className={owed > 0 ? "text-admin-amber" : "text-admin-ink-dim"}
                  >
                    {owed > 0 ? money(owed, row.currency) : "—"}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPillClasses(row)}`}>
                      {statusLabel(row.status, copy)}
                      {owed > 0 ? " ●" : ""}
                    </span>
                  </td>
                </tr>
                {open ? (
                  <tr data-testid={`orders-detail-${row.id}`}>
                    <td colSpan={7} style={{ padding: 0, borderTop: "1px solid var(--color-admin-border)" }}>
                      <DetailBody
                        row={row}
                        locale={locale}
                        copy={copy}
                        refundCopy={refundCopy}
                        channelLabel={channelLabel}
                        money={money}
                        threadHref={row.inquiryId ? threadHrefByInquiry[row.inquiryId] : undefined}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="m-0 list-none overflow-hidden rounded-[14px] border border-admin-border bg-admin-card p-0">
      {rows.map((row) => {
        const owed = outstandingCents(row);
        const open = openId === row.id;
        return (
          <li key={row.id} className="border-t border-admin-border-soft first:border-t-0">
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
              aria-expanded={open}
              aria-label={open ? copy.hideDetails : copy.viewDetails}
              onClick={() => toggle(row.id)}
              onKeyDown={(e) => onKey(e, row.id)}
              data-testid={`orders-row-${row.id}`}
            >
              <ChevronDown
                className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                style={{ color: "var(--color-admin-coral)" }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold leading-[1.3] text-admin-ink">
                  #{row.id.slice(0, 8).toUpperCase()} · {row.customerName ?? copy.noCustomer}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-[1.35] text-admin-ink-muted">
                  {lineCountLabel(row.lineCount, copy)} · {channelLabel(row.sourceChannel)} ·{" "}
                  <span className="whitespace-nowrap tabular-nums">{money(row.totalCents, row.currency)}</span>
                  {owed > 0 ? (
                    <>
                      {" "}
                      · {copy.colOutstanding} <span className="whitespace-nowrap tabular-nums">{money(owed, row.currency)}</span>
                    </>
                  ) : null}
                </span>
              </span>
              <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPillClasses(row)}`}>
                {statusLabel(row.status, copy)}
              </span>
            </button>
            {open ? (
              <div data-testid={`orders-detail-${row.id}`}>
                <DetailBody
                  row={row}
                  locale={locale}
                  copy={copy}
                  refundCopy={refundCopy}
                  channelLabel={channelLabel}
                  money={money}
                  threadHref={row.inquiryId ? threadHrefByInquiry[row.inquiryId] : undefined}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[10px] border border-admin-border-soft bg-admin-surface px-3 py-2.5">
      <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-muted">{title}</h3>
      <div className="text-[13px] text-admin-ink">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1 text-[13px]">
      <span className="text-admin-ink-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Exported so a test can check the four sections directly without clicking a row open. */
export function DetailBody({
  row,
  locale,
  copy,
  refundCopy,
  channelLabel,
  money,
  threadHref,
}: {
  row: OrderListRow;
  locale: string;
  copy: OrderRowDetailCopy;
  refundCopy: RefundFormCopy;
  channelLabel: (raw: string) => string;
  money: (cents: number, currency: string) => string;
  threadHref: string | undefined;
}) {
  const owed = outstandingCents(row);

  return (
    <div className="flex flex-col gap-2.5 bg-admin-card p-3.5">
      <Section title={copy.sectionCustomer}>
        <p className="font-semibold">{row.customerName ?? copy.noCustomer}</p>
        <p className="text-admin-ink-muted">{row.customerEmail ?? copy.noEmail}</p>
      </Section>

      <Section title={copy.sectionItems}>
        <p className="py-1">{lineCountLabel(row.lineCount, copy)}</p>
        <Fact label={copy.colTotal} value={money(row.totalCents, row.currency)} />
        <Fact label={copy.collectedLabel} value={money(row.collectedCents, row.currency)} />
        <Fact
          label={copy.colOutstanding}
          value={<span className={owed > 0 ? "font-semibold text-admin-amber" : undefined}>{money(owed, row.currency)}</span>}
        />
      </Section>

      <Section title={copy.sectionPayment}>
        <Fact
          label={copy.colStatus}
          value={
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPillClasses(row)}`}>
              {statusLabel(row.status, copy)}
            </span>
          }
        />
        {showsRefund(row.status) ? (
          <div className="mt-2">
            <OrdersRefundForm orderId={row.id} currency={row.currency} copy={refundCopy} />
          </div>
        ) : null}
      </Section>

      <Section title={copy.sectionInfo}>
        <Fact label={copy.orderIdLabel} value={<span className="font-mono text-[12px]">{row.id}</span>} />
        <Fact label={copy.placedLabel} value={formatWhen(row.createdAt, locale)} />
        <Fact label={copy.colChannel} value={channelLabel(row.sourceChannel)} />
        <Fact
          label={copy.openThread}
          value={
            threadHref ? (
              <Link href={threadHref} className="text-admin-accent underline" onClick={(e) => e.stopPropagation()}>
                {copy.openThread}
              </Link>
            ) : (
              <span className="text-admin-ink-dim">{copy.noThread}</span>
            )
          }
        />
      </Section>
    </div>
  );
}
