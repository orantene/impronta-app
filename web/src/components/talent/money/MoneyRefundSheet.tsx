"use client";

import { useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { COLORS } from "@/components/admin/shell/internal/state";
import type { PaymentDetailView } from "@/lib/money/money-spine-view";
import { formatMoneyMajor, formatMoneyShort } from "@/lib/money/money-spine-format";

import { MoneyAvatar } from "./money-spine-shared";
import {
  MoneyField,
  MoneyNote,
  MoneyOpt,
  MoneySheetBtn,
  MoneyTaskSheet,
  MoneyToast,
} from "./MoneyTaskSheet";

type PriceDecision = "lower" | "keep";

/**
 * Refund a card payment — `mc_refund` / `mc_refund_result`.
 * Confirm starts the refund path (live: `executeBookingRefund`); button
 * disables after one press per the visual spec.
 */
export function MoneyRefundSheet({
  detail,
  onClose,
}: {
  detail: PaymentDetailView;
  onClose: () => void;
}) {
  const copy = useDashboardText();
  const max = detail.payment.amount - (detail.refund?.amount ?? 0);
  const [amount, setAmount] = useState(String(Math.min(150, max)));
  const [reason, setReason] = useState(copy.t("One extension came off after a day"));
  const [price, setPrice] = useState<PriceDecision>("lower");
  const [pressed, setPressed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const amountN = Math.round(parseFloat(amount || "0"));
  const valid = amountN > 0 && amountN <= max;
  const lowered = detail.payment.amount - amountN;
  const remainingAfter = price === "lower" ? 0 : amountN;

  function confirm() {
    if (!valid || pressed) return;
    setPressed(true);
    setToast(
      copy.t("Refund of {amount} started").replace("{amount}", formatMoneyShort(amountN)),
    );
    window.setTimeout(onClose, 1200);
  }

  return (
    <>
      <MoneyTaskSheet
        data-money-sheet="mc_refund"
        title={copy.t("Refund")}
        subtitle={`${detail.payment.id} · ${detail.payment.clientName}`}
        onClose={onClose}
        footer={
          <>
            <MoneySheetBtn label={copy.t("Cancel")} onClick={onClose} disabled={pressed} />
            <MoneySheetBtn
              label={
                valid
                  ? copy.t("Refund {amount}").replace("{amount}", formatMoneyShort(amountN))
                  : copy.t("Refund")
              }
              primary
              disabled={!valid || pressed}
              onClick={confirm}
            />
          </>
        }
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <MoneyAvatar initials={detail.initials} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>{detail.payment.clientName}</div>
            <div style={{ fontSize: 13.5, color: COLORS.inkMuted }}>
              {detail.payment.forLabel} · {copy.t("Paid so far").toLowerCase()}{" "}
              {formatMoneyShort(detail.payment.amount)} {copy.t("by card")}
            </div>
          </div>
        </div>

        <MoneyField
          label={copy.t("Refund amount")}
          value={amount}
          onChange={setAmount}
          prefix="$"
          suffix="MXN"
          type="number"
          hint={`${copy.t("Up to")} ${formatMoneyShort(max)} ${copy.t("can be refunded.")}`}
        />
        <MoneyField
          label={copy.t("Reason · only you see it")}
          value={reason}
          onChange={setReason}
        />

        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.inkMuted }}>
          {copy.t("What happens to the price?")}
        </div>
        <MoneyOpt
          selected={price === "lower"}
          title={`${copy.t("Lower the price to")} ${formatMoneyShort(lowered)}`}
          detail={copy.t("Nothing left to pay.")}
          onClick={() => setPrice("lower")}
        />
        <MoneyOpt
          selected={price === "keep"}
          title={`${copy.t("Keep the price at")} ${formatMoneyShort(detail.payment.amount)}`}
          detail={copy.t("She would owe this amount again.").replace(
            "this amount",
            formatMoneyShort(amountN),
          )}
          onClick={() => setPrice("keep")}
        />

        <div
          style={{
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "8px 16px",
          }}
        >
          <Line label={copy.t("Paid")} value={formatMoneyMajor(detail.payment.amount)} />
          <Line label={copy.t("Refund")} value={`− ${formatMoneyMajor(amountN)}`} />
          <Line
            label={copy.t("Agreed price after")}
            value={formatMoneyMajor(price === "lower" ? lowered : detail.payment.amount)}
          />
          <Line
            label={copy.t("Remaining balance due")}
            value={formatMoneyMajor(remainingAfter)}
            strong
          />
        </div>

        <MoneyNote>
          {copy.t(
            "Goes back to the card; banks take 5 to 10 days. It will be deducted from the next payout. The original payment stays; the refund is added to it.",
          )}
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
