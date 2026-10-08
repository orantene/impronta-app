"use client";

/**
 * TUL-434 slice 1 — Pedidos order-door mockup, mounted only when the page
 * sees `?door=preview`. Default `/admin/orders` stays the live flat list.
 *
 * Keeps today's columns and refund path. What is NEW (chevron, door shell,
 * nested sections, deep link, phone sheet) is marked with a "New" chip so Oran
 * can judge the look before slices 2+ wire real section data and drawers.
 */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, Copy } from "lucide-react";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { outstandingCents, type OrderListRow } from "@/lib/orders/orders-list";
import {
  DOOR_SECTIONS,
  formatDoorLocalTime,
  matchOrderFromQuery,
  nextOpenOrderId,
  primaryActionForStatus,
  shortOrderCode,
  type DoorPrimaryAction,
  type DoorSectionId,
} from "@/lib/orders/orders-door-mock";
import { salesChannelLabel, type SalesLocale } from "@/lib/sales/activity-shape";
import { OrdersRefundForm, type RefundFormCopy } from "./orders-refund-form";

export type OrdersDoorMockCopy = {
  readonly newBadge: string;
  readonly mockBanner: string;
  readonly mockPreview: string;
  readonly colOrder: string;
  readonly colCustomer: string;
  readonly colChannel: string;
  readonly colTotal: string;
  readonly colOutstanding: string;
  readonly colStatus: string;
  readonly lineCount: string;
  readonly noCustomer: string;
  readonly openThread: string;
  readonly copyCode: string;
  readonly codeCopied: string;
  readonly back: string;
  readonly moreMenu: string;
  readonly primary: Record<Exclude<DoorPrimaryAction, "none">, string>;
  readonly sections: Record<DoorSectionId, { title: string; preview: string; body: string }>;
  readonly status: Record<string, string>;
};

type Props = {
  readonly rows: readonly OrderListRow[];
  readonly locale: string;
  readonly copy: OrdersDoorMockCopy;
  readonly refundCopy: RefundFormCopy;
  /** Mobile card list (phone) vs desktop table. */
  readonly variant: "desktop" | "mobile";
  /** Current `?order=` from the server (short code or id). */
  readonly orderParam: string;
  readonly bucket: string;
  readonly query: string;
};

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  green: "#2E7D5B",
  amber: "#B45309",
  newRing: "rgba(180,83,9,0.45)",
  newBg: "rgba(180,83,9,0.08)",
} as const;

function NewChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: C.newBg, color: C.amber, border: `1px dashed ${C.newRing}` }}
    >
      {label}
    </span>
  );
}

function statusLabel(status: string, copy: OrdersDoorMockCopy): string {
  return copy.status[status] ?? status;
}

export function OrdersDoorMockList({
  rows,
  locale,
  copy,
  refundCopy,
  variant,
  orderParam,
  bucket,
  query,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const channelLocale: SalesLocale = locale === "es" || locale === "fr" ? locale : "en";
  const channelLabel = (raw: string) => salesChannelLabel(raw, channelLocale);

  const initialOpen = useMemo(
    () => matchOrderFromQuery(rows, orderParam),
    [rows, orderParam],
  );
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of DOOR_SECTIONS) init[s.id] = s.defaultOpen;
    return init;
  });

  useEffect(() => {
    setOpenId(initialOpen);
  }, [initialOpen]);

  const writeOrderParam = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams();
      // Stay on the preview gate — dropping `door=preview` would unmount this mock.
      next.set("door", "preview");
      if (bucket && bucket !== "all") next.set("bucket", bucket);
      if (query) next.set("q", query);
      if (id) next.set("order", shortOrderCode(id));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [bucket, pathname, query, router],
  );

  const toggleRow = useCallback(
    (id: string) => {
      const next = nextOpenOrderId(openId, id);
      setOpenId(next);
      writeOrderParam(next);
      if (next) {
        const init: Record<string, boolean> = {};
        for (const s of DOOR_SECTIONS) init[s.id] = s.defaultOpen;
        setSectionOpen(init);
      }
    },
    [openId, writeOrderParam],
  );

  const onRowKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleRow(id);
    }
  };

  const copyCode = async (id: string) => {
    try {
      await navigator.clipboard.writeText(shortOrderCode(id));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* clipboard can refuse; the code stays visible */
    }
  };

  const openRow = openId ? rows.find((r) => r.id === openId) ?? null : null;
  const sheetMode = variant === "mobile";

  return (
    <div>
      <div
        className="mb-3 flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-snug"
        style={{ background: C.newBg, border: `1px dashed ${C.newRing}`, color: C.ink }}
        data-testid="orders-door-mock-banner"
      >
        <NewChip label={copy.newBadge} />
        <span style={{ color: C.inkMuted }}>{copy.mockBanner}</span>
      </div>

      {variant === "desktop" ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.inkMuted, fontSize: 12 }}>
                <th style={{ padding: "10px 8px", fontWeight: 500, width: 28 }} aria-hidden />
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>{copy.colOrder}</th>
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>{copy.colCustomer}</th>
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>{copy.colChannel}</th>
                <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>
                  {copy.colTotal}
                </th>
                <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>
                  {copy.colOutstanding}
                </th>
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>{copy.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = openId === row.id;
                const owed = outstandingCents(row);
                return (
                  <DesktopRow
                    key={row.id}
                    row={row}
                    open={open}
                    owed={owed}
                    copy={copy}
                    channelLabel={channelLabel}
                    onToggle={() => toggleRow(row.id)}
                    onKey={(e) => onRowKey(e, row.id)}
                    door={
                      open ? (
                        <DoorBody
                          row={row}
                          locale={locale}
                          channelLabel={channelLabel}
                          copy={copy}
                          refundCopy={refundCopy}
                          sectionOpen={sectionOpen}
                          setSectionOpen={setSectionOpen}
                          onCopy={() => void copyCode(row.id)}
                          copied={copiedId === row.id}
                          sheet={false}
                          onClose={() => toggleRow(row.id)}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-[14px] border border-admin-border bg-admin-card p-0">
          {rows.map((row) => {
            const open = openId === row.id;
            const owed = outstandingCents(row);
            const toPay = row.status === "pending_payment";
            const pill =
              toPay
                ? "bg-admin-coral-soft text-admin-coral-deep"
                : row.status === "paid"
                  ? "bg-admin-success-soft text-admin-green"
                  : "bg-admin-amber-soft text-admin-amber";
            return (
              <li key={row.id} className="border-t border-admin-border-soft first:border-t-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
                  aria-expanded={open}
                  onClick={() => toggleRow(row.id)}
                  onKeyDown={(e) => onRowKey(e, row.id)}
                >
                  <ChevronDown
                    className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                    style={{ color: C.amber }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold leading-[1.3] text-admin-ink">
                      #{shortOrderCode(row.id)} · {row.customerName ?? copy.noCustomer}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-[1.35] text-admin-ink-muted">
                      {row.lineCount} {copy.lineCount} · {channelLabel(row.sourceChannel)} ·{" "}
                      {formatOrderMoney(row.totalCents, row.currency)}
                      {owed > 0
                        ? ` · ${copy.colOutstanding} ${formatOrderMoney(owed, row.currency)}`
                        : ""}
                    </span>
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill}`}
                  >
                    {statusLabel(row.status, copy)}
                    {owed > 0 ? (
                      <span className="ml-1" style={{ color: C.amber }}>
                        ●
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {sheetMode && openRow ? (
        <>
          {/* ≤390 px: full-height sheet with back arrow */}
          <div
            className="fixed inset-0 z-50 hidden flex-col bg-white max-[390px]:flex"
            role="dialog"
            aria-modal="true"
            data-testid="orders-door-sheet"
          >
            <DoorBody
              row={openRow}
              locale={locale}
              channelLabel={channelLabel}
              copy={copy}
              refundCopy={refundCopy}
              sectionOpen={sectionOpen}
              setSectionOpen={setSectionOpen}
              onCopy={() => void copyCode(openRow.id)}
              copied={copiedId === openRow.id}
              sheet
              onClose={() => toggleRow(openRow.id)}
            />
          </div>
          {/* 391–720 px: expand in place under the list */}
          <div
            className="mt-2 hidden overflow-hidden rounded-[12px] border min-[391px]:block"
            style={{ borderColor: C.newRing, borderStyle: "dashed" }}
            data-testid="orders-door-inline-mobile"
          >
            <DoorBody
              row={openRow}
              locale={locale}
              channelLabel={channelLabel}
              copy={copy}
              refundCopy={refundCopy}
              sectionOpen={sectionOpen}
              setSectionOpen={setSectionOpen}
              onCopy={() => void copyCode(openRow.id)}
              copied={copiedId === openRow.id}
              sheet={false}
              onClose={() => toggleRow(openRow.id)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function DesktopRow({
  row,
  open,
  owed,
  copy,
  channelLabel,
  onToggle,
  onKey,
  door,
}: {
  row: OrderListRow;
  open: boolean;
  owed: number;
  copy: OrdersDoorMockCopy;
  channelLabel: (raw: string) => string;
  onToggle: () => void;
  onKey: (e: KeyboardEvent) => void;
  door: ReactNode;
}) {
  return (
    <>
      <tr
        style={{
          borderTop: `1px solid ${C.border}`,
          background: open ? C.surface : undefined,
          cursor: "pointer",
        }}
        aria-expanded={open}
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={onKey}
        data-testid={`orders-door-row-${shortOrderCode(row.id)}`}
      >
        <td style={{ padding: "12px 8px", width: 28 }}>
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            style={{ color: C.amber }}
            aria-hidden
          />
        </td>
        <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums" }}>
          <span className="inline-flex items-center gap-1.5">
            {shortOrderCode(row.id)}
            {open ? <NewChip label={copy.newBadge} /> : null}
          </span>
          <div style={{ color: C.inkDim, fontSize: 12 }}>
            {row.lineCount} {copy.lineCount}
          </div>
        </td>
        <td style={{ padding: "12px" }}>
          {row.customerName ?? <span style={{ color: C.inkDim }}>{copy.noCustomer}</span>}
          {row.customerEmail ? (
            <div style={{ color: C.inkDim, fontSize: 12 }}>{row.customerEmail}</div>
          ) : null}
        </td>
        <td style={{ padding: "12px", color: C.inkMuted }}>{channelLabel(row.sourceChannel)}</td>
        <td
          style={{
            padding: "12px",
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatOrderMoney(row.totalCents, row.currency)}
        </td>
        <td
          style={{
            padding: "12px",
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            color: owed > 0 ? C.amber : C.inkDim,
          }}
        >
          {owed > 0 ? formatOrderMoney(owed, row.currency) : "—"}
        </td>
        <td style={{ padding: "12px" }}>
          {statusLabel(row.status, copy)}
          {owed > 0 ? <span style={{ color: C.amber }}> ●</span> : null}
        </td>
      </tr>
      {door ? (
        <tr data-testid={`orders-door-panel-${shortOrderCode(row.id)}`}>
          <td colSpan={7} style={{ padding: 0, borderTop: `1px dashed ${C.newRing}` }}>
            {door}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DoorBody({
  row,
  locale,
  channelLabel,
  copy,
  refundCopy,
  sectionOpen,
  setSectionOpen,
  onCopy,
  copied,
  sheet,
  onClose,
}: {
  row: OrderListRow;
  locale: string;
  channelLabel: (raw: string) => string;
  copy: OrdersDoorMockCopy;
  refundCopy: RefundFormCopy;
  sectionOpen: Record<string, boolean>;
  setSectionOpen: (next: Record<string, boolean>) => void;
  onCopy: () => void;
  copied: boolean;
  sheet: boolean;
  onClose: () => void;
}) {
  const owed = outstandingCents(row);
  const action = primaryActionForStatus(row.status, row.sourceChannel);
  const when = formatDoorLocalTime(row.createdAt, locale);

  return (
    <div
      className={sheet ? "flex h-full flex-col overflow-auto" : ""}
      style={{
        background: C.cardBg,
        padding: sheet ? "16px 16px 28px" : "16px 18px 20px",
      }}
    >
      {sheet ? (
        <button
          type="button"
          onClick={onClose}
          className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium"
          style={{ color: C.ink }}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {copy.back}
        </button>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <NewChip label={copy.newBadge} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold"
          style={{ background: C.surface, color: C.ink }}
          title={copy.copyCode}
        >
          {shortOrderCode(row.id)}
          <Copy className="size-3.5" aria-hidden />
        </button>
        {copied ? (
          <span className="text-[11px]" style={{ color: C.green }}>
            {copy.codeCopied}
          </span>
        ) : null}
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            background:
              row.status === "paid" || row.status === "fulfilled"
                ? "rgba(46,125,91,0.12)"
                : owed > 0
                  ? "rgba(180,83,9,0.12)"
                  : C.surface,
            color:
              row.status === "paid" || row.status === "fulfilled"
                ? C.green
                : owed > 0
                  ? C.amber
                  : C.inkMuted,
          }}
        >
          {statusLabel(row.status, copy)}
          {owed > 0 ? " ●" : ""}
        </span>
        <span className="text-[12px]" style={{ color: C.inkMuted }}>
          {when}
        </span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
          style={{ background: C.surface, color: C.inkMuted }}
        >
          {channelLabel(row.sourceChannel)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {action !== "none" ? (
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white"
              style={{ background: C.ink }}
              onClick={(e) => e.stopPropagation()}
            >
              {copy.primary[action]}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold"
            style={{ border: `1px solid ${C.border}`, color: C.inkMuted }}
            aria-label={copy.moreMenu}
            onClick={(e) => e.stopPropagation()}
          >
            …
          </button>
        </span>
      </div>

      <p className="mb-3 text-[12px]" style={{ color: C.inkDim }}>
        {copy.mockPreview}
      </p>

      <div className="flex flex-col gap-2">
        {DOOR_SECTIONS.map((s) => {
          const open = sectionOpen[s.id] ?? s.defaultOpen;
          const meta = copy.sections[s.id];
          return (
            <div
              key={s.id}
              className="overflow-hidden rounded-[10px]"
              style={{ border: `1px dashed ${C.newRing}`, background: C.surface }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                aria-expanded={open}
                onClick={(e) => {
                  e.stopPropagation();
                  setSectionOpen({ ...sectionOpen, [s.id]: !open });
                }}
              >
                <ChevronDown
                  className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
                <span className="text-[13px] font-semibold" style={{ color: C.ink }}>
                  {meta.title}
                </span>
                {!open ? (
                  <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: C.inkMuted }}>
                    {sectionPreview(s.id, row, channelLabel, copy, owed)}
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                <NewChip label={copy.newBadge} />
              </button>
              {open ? (
                <div className="px-3 pb-3 text-[12.5px] leading-relaxed" style={{ color: C.inkMuted }}>
                  <SectionBody
                    id={s.id}
                    row={row}
                    channelLabel={channelLabel}
                    copy={copy}
                    refundCopy={refundCopy}
                    owed={owed}
                    when={when}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sectionPreview(
  id: DoorSectionId,
  row: OrderListRow,
  channelLabel: (raw: string) => string,
  copy: OrdersDoorMockCopy,
  owed: number,
): string {
  switch (id) {
    case "client":
      return row.customerName ?? copy.noCustomer;
    case "items":
      return `${row.lineCount} ${copy.lineCount}`;
    case "payments":
      return owed > 0
        ? formatOrderMoney(owed, row.currency)
        : formatOrderMoney(row.collectedCents, row.currency);
    case "conversation":
      return row.inquiryId ? copy.openThread : copy.sections.conversation.preview;
    case "origin":
      return channelLabel(row.sourceChannel);
    default:
      return copy.sections[id].preview;
  }
}

function SectionBody({
  id,
  row,
  channelLabel,
  copy,
  refundCopy,
  owed,
  when,
}: {
  id: DoorSectionId;
  row: OrderListRow;
  channelLabel: (raw: string) => string;
  copy: OrdersDoorMockCopy;
  refundCopy: RefundFormCopy;
  owed: number;
  when: string;
}) {
  if (id === "summary") {
    return (
      <div className="space-y-1.5">
        <p>{copy.sections.summary.body}</p>
        <p>
          <strong style={{ color: C.ink }}>{copy.colTotal}:</strong>{" "}
          {formatOrderMoney(row.totalCents, row.currency)}
          {" · "}
          <strong style={{ color: C.ink }}>{copy.colOutstanding}:</strong>{" "}
          {owed > 0 ? formatOrderMoney(owed, row.currency) : formatOrderMoney(0, row.currency)}
        </p>
        <p>
          <strong style={{ color: C.ink }}>{copy.sections.summary.title}:</strong> {when}
        </p>
      </div>
    );
  }
  if (id === "client") {
    return (
      <div className="space-y-1">
        <p>
          <strong style={{ color: C.ink }}>{row.customerName ?? copy.noCustomer}</strong>
        </p>
        {row.customerEmail ? <p>{row.customerEmail}</p> : null}
        <p>{copy.sections.client.body}</p>
      </div>
    );
  }
  if (id === "items") {
    return (
      <div className="space-y-2">
        <p>
          {row.lineCount} {copy.lineCount}
        </p>
        <p>{copy.sections.items.body}</p>
      </div>
    );
  }
  if (id === "payments") {
    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <p>
          {copy.colTotal} {formatOrderMoney(row.totalCents, row.currency)}
          {" · "}
          {copy.colOutstanding}{" "}
          {owed > 0 ? formatOrderMoney(owed, row.currency) : formatOrderMoney(0, row.currency)}
        </p>
        <p>{copy.sections.payments.body}</p>
        {row.status === "paid" || row.status === "partially_refunded" ? (
          <OrdersRefundForm orderId={row.id} currency={row.currency} copy={refundCopy} />
        ) : null}
      </div>
    );
  }
  if (id === "origin") {
    return (
      <div className="space-y-1">
        <p>
          <strong style={{ color: C.ink }}>{channelLabel(row.sourceChannel)}</strong>
        </p>
        <p>{copy.sections.origin.body}</p>
      </div>
    );
  }
  if (id === "conversation") {
    return (
      <div className="space-y-1">
        <p>
          {row.inquiryId ? copy.openThread : copy.sections.conversation.preview}
        </p>
        <p>{copy.sections.conversation.body}</p>
      </div>
    );
  }
  return <p>{copy.sections[id].body}</p>;
}
