"use client";

import { useRouter } from "next/navigation";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import type { MoneyAgendaRow } from "@/lib/talent/money-home";

function money(cents: number, currency: string): string {
  const amount = Math.round(cents) / 100;
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted} ${currency}`;
}

function day(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

const btnBase =
  "inline-flex h-11 items-center justify-center rounded-full border px-4 font-admin-body text-[13.5px] font-semibold sm:h-9";
const btnSec = `${btnBase} border-admin-border-soft bg-white text-admin-ink`;
const btnPri = `${btnBase} border-admin-ink bg-admin-ink text-white`;

export function AgendaMoneyLine({
  row,
  first,
  onRequest,
  onRefund,
  refundBusy,
}: {
  row: MoneyAgendaRow;
  first: boolean;
  onRequest: (row: MoneyAgendaRow) => void;
  onRefund?: (row: MoneyAgendaRow) => void;
  refundBusy?: boolean;
}) {
  const copy = useDashboardText();
  const t = copy.t;
  const router = useRouter();
  const warn = row.kind === "refund_pending" || row.overdue;
  const kindLabel =
    row.kind === "refund_pending"
      ? t("Refund pending")
      : row.kind === "deposit"
        ? t("Deposit requested")
        : row.overdue
          ? t("Overdue")
          : t("Balance due");
  return (
    <div
      className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center ${first ? "" : "border-t border-admin-border-soft"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-admin-body text-[15px] font-bold text-admin-ink">{row.name}</div>
        <div className={`text-[13px] ${warn ? "font-semibold text-admin-critical" : "text-admin-ink-muted"}`}>
          {[kindLabel, row.service, day(row.startsAt, copy.locale)].filter(Boolean).join(" · ")}
        </div>
      </div>
      <span
        className={`whitespace-nowrap font-admin-body text-[15px] font-bold ${
          warn ? "text-admin-critical" : "text-admin-ink"
        }`}
      >
        {row.amountCents != null ? money(row.amountCents, row.currency) : t("Amount not set")}
      </span>
      <div className="flex gap-2">
        <button type="button" className={`${btnSec} flex-1`} onClick={() => router.push(row.bookingHref)}>
          {t("Open booking")}
        </button>
        {row.kind === "refund_pending" ? (
          <button
            type="button"
            className={`${btnPri} flex-1`}
            disabled={refundBusy}
            onClick={() => onRefund?.(row)}
          >
            {refundBusy ? t("Refunding…") : t("Refund")}
          </button>
        ) : (
          <button type="button" className={`${btnSec} flex-1`} onClick={() => onRequest(row)}>
            {t("Send a payment link")}
          </button>
        )}
      </div>
    </div>
  );
}
