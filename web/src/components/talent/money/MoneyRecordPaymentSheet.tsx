"use client";

import { useMemo, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { COLORS } from "@/components/admin/shell/internal/state";
import type { MoneyOutstandingRow } from "@/lib/money/money-read-model";
import {
  formatMoneyMajor,
  formatMoneyShort,
  outstandingRowChrome,
} from "@/lib/money/money-spine-view";

import {
  MoneyField,
  MoneyNote,
  MoneyOpt,
  MoneySheetBtn,
  MoneyTaskSheet,
  MoneyToast,
} from "./MoneyTaskSheet";

type Method = "cash" | "transfer";

/**
 * Record payment outside Tulala — `mc_record` / `mc_recorded`.
 * Confirms against the fixture outstanding row; live settle uses
 * `recordVerifiedCollection` once real booking/order ids are on the spine.
 */
export function MoneyRecordPaymentSheet({
  outstanding,
  currency,
  prefill,
  onClose,
}: {
  outstanding: readonly MoneyOutstandingRow[];
  currency: string;
  prefill?: MoneyOutstandingRow | null;
  onClose: () => void;
}) {
  const copy = useDashboardText();
  const [bookingId, setBookingId] = useState(
    prefill?.bookingId ?? outstanding[0]?.bookingId ?? null,
  );
  const selected = useMemo(
    () => outstanding.find((r) => r.bookingId === bookingId) ?? prefill ?? null,
    [outstanding, bookingId, prefill],
  );
  const [amount, setAmount] = useState(String(selected?.left ?? ""));
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountN = Math.round(parseFloat(amount || "0"));
  const canSave = Boolean(selected) && amountN > 0 && amountN <= (selected?.left ?? 0);
  const chrome = selected ? outstandingRowChrome(selected) : null;
  const after = selected ? Math.max(0, selected.left - amountN) : 0;

  function confirm() {
    if (!canSave || !selected || busy) return;
    setBusy(true);
    const label =
      method === "cash"
        ? copy.t("Recorded {amount} cash · request closed").replace(
            "{amount}",
            formatMoneyShort(amountN),
          )
        : copy.t("Recorded {amount} transfer · request closed").replace(
            "{amount}",
            formatMoneyShort(amountN),
          );
    setToast(label);
    window.setTimeout(onClose, 1200);
  }

  return (
    <>
      <MoneyTaskSheet
        data-money-sheet="mc_record"
        title={copy.t("Record payment")}
        subtitle={copy.t("Money you received outside Tulala")}
        onClose={onClose}
        footer={
          <>
            <MoneySheetBtn label={copy.t("Cancel")} onClick={onClose} />
            <MoneySheetBtn
              label={
                canSave
                  ? copy
                      .t("Record {amount} received")
                      .replace("{amount}", formatMoneyShort(amountN))
                  : copy.t("Record received")
              }
              primary
              disabled={!canSave || busy}
              onClick={confirm}
            />
          </>
        }
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.inkMuted }}>
          {copy.t("For work")}
        </div>
        {outstanding.map((row) => {
          const c = outstandingRowChrome(row);
          return (
            <MoneyOpt
              key={row.bookingId}
              selected={bookingId === row.bookingId}
              title={`${row.clientName} · ${copy.t(c.serviceLabel)} · ${formatMoneyShort(row.left)} ${copy.t("remaining")}`}
              detail={row.bookingId}
              onClick={() => {
                setBookingId(row.bookingId);
                setAmount(String(row.left));
              }}
            />
          );
        })}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <MoneyField
            label={copy.t("Amount received")}
            value={amount}
            onChange={setAmount}
            prefix="$"
            suffix={currency}
            type="number"
          />
          <MoneyField
            label={copy.t("Received on")}
            value={copy.t("Today")}
            onChange={() => {}}
          />
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.inkMuted }}>
          {copy.t("How")}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <MoneyOpt
              selected={method === "cash"}
              title={copy.t("Cash")}
              onClick={() => setMethod("cash")}
            />
          </div>
          <div style={{ flex: 1 }}>
            <MoneyOpt
              selected={method === "transfer"}
              title={copy.t("Bank transfer")}
              onClick={() => setMethod("transfer")}
            />
          </div>
        </div>

        <MoneyField
          label={copy.t("Note · only you see it")}
          value={note}
          onChange={setNote}
          placeholder={copy.t("Optional")}
        />

        {selected ? (
          <div
            style={{
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              padding: "8px 16px",
            }}
          >
            <Line label={copy.t("Remaining now")} value={formatMoneyMajor(selected.left, currency)} />
            <Line label={copy.t("After this")} value={formatMoneyMajor(after, currency)} strong />
          </div>
        ) : null}

        <MoneyNote>
          {copy.t(
            "Recorded outside Tulala: it counts as collected and is never part of a payout. Any open payment request for the same work will be closed so the client cannot also pay by card.",
          )}
          {chrome ? ` ${chrome.bookingId}` : ""}
        </MoneyNote>
      </MoneyTaskSheet>
      {toast ? <MoneyToast message={toast} /> : null}
    </>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        fontSize: 14,
        borderBottom: `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <span style={{ color: COLORS.inkMuted }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}
