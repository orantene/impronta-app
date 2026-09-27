"use client";

import { useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { COLORS } from "@/components/admin/shell/internal/state";
import type { MoneyPaymentRow } from "@/lib/money/money-read-model";
import { formatMoneyMajor, formatMoneyShort } from "@/lib/money/money-spine-format";

import {
  MoneyField,
  MoneyNote,
  MoneyOpt,
  MoneySheetBtn,
  MoneyTaskSheet,
  MoneyToast,
} from "./MoneyTaskSheet";

type Reason =
  | "wrong_amount"
  | "recorded_twice"
  | "did_not_pay"
  | "gave_back";

/**
 * Correct a cash/transfer record — `mc_cash_correct`.
 * Adds a correction next to the original; nothing is deleted or moved by Tulala.
 */
export function MoneyCorrectRecordSheet({
  payment,
  onClose,
}: {
  payment: MoneyPaymentRow;
  onClose: () => void;
}) {
  const copy = useDashboardText();
  const [reason, setReason] = useState<Reason>("gave_back");
  const [amount, setAmount] = useState("120");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountN = Math.round(parseFloat(amount || "0"));
  const needsAmount = reason === "gave_back" || reason === "wrong_amount";
  const canSave = !needsAmount || (amountN > 0 && amountN <= payment.amount);

  function confirm() {
    if (!canSave || busy) return;
    setBusy(true);
    setToast(copy.t("Correction saved"));
    window.setTimeout(onClose, 1200);
  }

  return (
    <>
      <MoneyTaskSheet
        data-money-sheet="mc_cash_correct"
        title={copy.t("Correct record")}
        subtitle={payment.id}
        onClose={onClose}
        footer={
          <>
            <MoneySheetBtn label={copy.t("Cancel")} onClick={onClose} />
            <MoneySheetBtn
              label={copy.t("Save correction")}
              primary
              disabled={!canSave || busy}
              onClick={confirm}
            />
          </>
        }
      >
        <div
          style={{
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontWeight: 600 }}>
              {payment.clientName}
            </span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatMoneyMajor(payment.amount)}
            </span>
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 4 }}>
            {payment.method === "cash"
              ? copy.t("Cash · recorded by you")
              : copy.t("Transfer · recorded by you")}
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.inkMuted }}>
          {copy.t("What happened?")}
        </div>
        <MoneyOpt
          selected={reason === "wrong_amount"}
          title={copy.t("I recorded the wrong amount")}
          onClick={() => setReason("wrong_amount")}
        />
        <MoneyOpt
          selected={reason === "recorded_twice"}
          title={copy.t("I recorded it twice")}
          onClick={() => setReason("recorded_twice")}
        />
        <MoneyOpt
          selected={reason === "did_not_pay"}
          title={copy.t("She did not actually pay")}
          onClick={() => setReason("did_not_pay")}
        />
        <MoneyOpt
          selected={reason === "gave_back"}
          title={copy.t("I gave money back")}
          detail={copy.t(
            "Records a refund you already gave; it does not move any money.",
          )}
          onClick={() => setReason("gave_back")}
        />

        {needsAmount ? (
          <MoneyField
            label={
              reason === "gave_back"
                ? copy.t("Amount given back")
                : copy.t("Correct amount")
            }
            value={amount}
            onChange={setAmount}
            prefix="$"
            suffix="MXN"
            type="number"
          />
        ) : null}

        <MoneyNote>
          {copy.t(
            "Adds a correction dated today next to the original. Collected after refunds drops by the corrected amount.",
          )}
          {reason === "gave_back" && amountN > 0
            ? ` (−${formatMoneyShort(amountN)})`
            : ""}
        </MoneyNote>
      </MoneyTaskSheet>
      {toast ? <MoneyToast message={toast} /> : null}
    </>
  );
}
