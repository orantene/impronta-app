"use client";

import { useState, useTransition } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { AgendaPanelFrame } from "@/components/admin/shell/internal/talent/agenda/AgendaPanelFrame";
import type { ManualPaymentMethod } from "@/lib/bookings/manual-payment";
import { recordBookingPayment } from "@/lib/talent-agenda";
import type { MoneyAgendaRow } from "@/lib/talent/money-home";

const METHODS: ReadonlyArray<readonly [ManualPaymentMethod, string]> = [
  ["cash", "Cash"],
  ["transfer", "Bank transfer"],
  ["card", "Card in person"],
  ["other", "Other"],
];

const btnBase =
  "inline-flex h-11 items-center justify-center rounded-full border px-4 font-admin-body text-[13.5px] font-semibold sm:h-9";
const btnSec = `${btnBase} border-admin-border-soft bg-white text-admin-ink`;
const btnPri = `${btnBase} border-admin-ink bg-admin-ink text-white disabled:opacity-50`;

function money(cents: number, currency: string): string {
  const amount = Math.round(cents) / 100;
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function parseCents(raw: string): number | null {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * Money > Record payment for one booking: amount + method, confirm received,
 * done. Writes ONE manual ledger row via recordBookingPayment; the server caps
 * the total at the booking price and replays a double submit.
 */
export function MoneyRecordPaymentPanel({
  row,
  onClose,
  onDone,
}: {
  row: MoneyAgendaRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useDashboardText();
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [amount, setAmount] = useState(row.amountCents ? String(row.amountCents / 100) : "");
  const [method, setMethod] = useState<ManualPaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ paid: number; remaining: number } | null>(null);
  const [pending, start] = useTransition();
  // One key per opened sheet: a double tap or a retry replays, never doubles.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const cents = parseCents(amount);
  const cur = row.currency.toUpperCase();
  const methodLabel = METHODS.find(([id]) => id === method)?.[1] ?? "";
  const overDue = cents != null && row.amountCents != null && cents > row.amountCents;

  function reasonText(reason: string, remaining?: number): string {
    if (reason === "over_total") {
      return remaining != null
        ? `${t("That is more than the booking total. Still owed:")} ${money(remaining, cur)}`
        : t("That is more than the booking total.");
    }
    if (reason === "already_paid") return t("This booking is already paid in full.");
    if (reason === "no_total") return t("Set the booking price first.");
    if (reason === "open_charge") return t("A payment link is still open on this booking. Cancel it first.");
    if (reason === "cancelled") return t("This booking is cancelled.");
    if (reason === "invalid_amount") return t("Enter an amount above zero.");
    return t("Could not record the payment. Try again.");
  }

  function confirm() {
    if (!method || cents == null || pending) return;
    setError(null);
    start(async () => {
      const res = await recordBookingPayment({
        bookingId: row.id,
        amountCents: cents,
        method,
        idempotencyKey,
      });
      if (!res.ok) {
        setError(reasonText(res.reason, "remainingCents" in res ? res.remainingCents : undefined));
        setStep("form");
        return;
      }
      setResult({ paid: cents, remaining: res.remainingCents });
      setStep("done");
    });
  }

  const footer =
    step === "form" ? (
      <div className="flex gap-2">
        <button type="button" className={`${btnSec} flex-1`} onClick={onClose}>
          {t("Cancel")}
        </button>
        <button
          type="button"
          className={`${btnPri} flex-1`}
          disabled={!method || cents == null || overDue}
          onClick={() => setStep("confirm")}
        >
          {t("Continue")}
        </button>
      </div>
    ) : step === "confirm" ? (
      <div className="flex gap-2">
        <button type="button" className={`${btnSec} flex-1`} onClick={() => setStep("form")}>
          {t("Back")}
        </button>
        <button type="button" className={`${btnPri} flex-1`} disabled={pending} onClick={confirm}>
          {pending ? t("Saving") : t("Confirm received")}
        </button>
      </div>
    ) : (
      <button type="button" className={`${btnPri} w-full`} onClick={onDone}>
        {t("Done")}
      </button>
    );

  return (
    <AgendaPanelFrame
      title={t("Record payment")}
      subtitle={row.name}
      onClose={step === "done" ? onDone : onClose}
      dataAttr="data-money-record-payment"
      footer={footer}
    >
      {step === "form" ? (
        <div className="space-y-4">
          {row.amountCents != null ? (
            <p className="font-admin-body text-[13px] text-admin-ink-muted">
              {t("Still owed")}: {money(row.amountCents, cur)}
            </p>
          ) : null}
          <label className="block">
            <span className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("Amount received")}</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 h-11 w-full rounded-[12px] border border-admin-border-soft bg-white px-3 font-admin-body text-[15px] text-admin-ink"
              aria-label={t("Amount received")}
            />
          </label>
          {overDue ? (
            <p role="alert" className="font-admin-body text-[13px] text-admin-critical">
              {t("That is more than the booking total. Still owed:")} {money(row.amountCents ?? 0, cur)}
            </p>
          ) : null}
          <fieldset className="space-y-2">
            <legend className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("How was it paid?")}</legend>
            {METHODS.map(([id, label]) => (
              <label
                key={id}
                className="flex min-h-[48px] items-center gap-3 rounded-[12px] border border-admin-border-soft bg-white px-3 font-admin-body text-[14px] text-admin-ink"
              >
                <input type="radio" name="record-method" checked={method === id} onChange={() => setMethod(id)} />
                {t(label)}
              </label>
            ))}
          </fieldset>
          {error ? (
            <p role="alert" className="font-admin-body text-[13px] text-admin-critical">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === "confirm" && cents != null ? (
        <div className="space-y-3 font-admin-body text-[14px] text-admin-ink">
          <p>
            {t("You received")} <strong>{money(cents, cur)}</strong> {t("by")} <strong>{t(methodLabel)}</strong>.
          </p>
          <p className="text-[13px] text-admin-ink-muted">
            {t("This is recorded as collected by you. It never becomes a Tulala payout.")}
          </p>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="space-y-2 font-admin-body text-[14px] text-admin-ink" aria-live="polite">
          <p className="font-semibold">{t("Payment recorded")}</p>
          <p className="text-[13px] text-admin-ink-muted">
            {result.remaining > 0
              ? `${t("Still owed")}: ${money(result.remaining, cur)}`
              : t("Paid in full.")}
          </p>
        </div>
      ) : null}
    </AgendaPanelFrame>
  );
}
