"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import type { MoneyOutstandingRow } from "@/lib/money/money-read-model";
import {
  formatMoneyMajor,
  formatMoneyShort,
  outstandingRowChrome,
} from "@/lib/money/money-spine-view";

import { MoneyAvatar } from "./money-spine-shared";
import {
  MoneyField,
  MoneyNote,
  MoneyOpt,
  MoneySheetBtn,
  MoneyTaskSheet,
  MoneyToast,
} from "./MoneyTaskSheet";

type Step = "pick" | "amount" | "created";
type AmountKind = "remaining" | "other";
type ShareHow = "messages" | "whatsapp";

/**
 * Request payment from Money — `mc_req_pick` → `mc_req_amount` → `mc_req_created`.
 * Fixture ledger rows drive the pick list; Create prepares a share step (mint
 * against a live order id lands with the real-earnings read model).
 */
export function MoneyRequestPaymentSheet({
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
  const [step, setStep] = useState<Step>(prefill ? "amount" : "pick");
  const [selectedId, setSelectedId] = useState<string | null>(prefill?.bookingId ?? null);
  const [standalone, setStandalone] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [amountKind, setAmountKind] = useState<AmountKind>("remaining");
  const [otherAmount, setOtherAmount] = useState("");
  const [shareHow, setShareHow] = useState<ShareHow>("messages");
  const [toast, setToast] = useState<string | null>(null);
  const [linkCode] = useState(() => Math.random().toString(36).slice(2, 8).toUpperCase());

  const selected = useMemo(
    () => outstanding.find((r) => r.bookingId === selectedId) ?? prefill ?? null,
    [outstanding, selectedId, prefill],
  );

  const amount = useMemo(() => {
    if (!selected) return 0;
    if (amountKind === "remaining") return selected.left;
    const n = Math.round(parseFloat(otherAmount || "0"));
    return Number.isFinite(n) ? Math.max(0, Math.min(n, selected.left)) : 0;
  }, [selected, amountKind, otherAmount]);

  const chrome = selected ? outstandingRowChrome(selected) : null;
  const canContinuePick = Boolean(selected) || (standalone && purpose.trim().length >= 3);
  const canCreate = Boolean(selected) && amount > 0;

  function finish(sent: boolean) {
    const msg = sent
      ? copy.t("Sent in Messages")
      : copy.t("Request ready · share when you want");
    setToast(msg);
    window.setTimeout(onClose, 1200);
  }

  if (step === "pick") {
    return (
      <>
        <MoneyTaskSheet
          data-money-sheet="mc_req_pick"
          title={copy.t("Request payment")}
          subtitle={copy.t("Step 1 of 3")}
          onClose={onClose}
          footer={
            <>
              <MoneySheetBtn label={copy.t("Cancel")} onClick={onClose} />
              <MoneySheetBtn
                label={copy.t("Continue")}
                primary
                disabled={!canContinuePick}
                onClick={() => {
                  if (standalone) {
                    setToast(copy.t("Standalone requests need a live booking or order."));
                    return;
                  }
                  setStep("amount");
                }}
              />
            </>
          }
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.inkMuted }}>
            {copy.t("What is this payment for?")}
          </div>
          {outstanding.map((row) => {
            const c = outstandingRowChrome(row);
            return (
              <MoneyOpt
                key={row.bookingId}
                selected={selectedId === row.bookingId && !standalone}
                title={`${copy.t(c.serviceLabel)} · ${formatMoneyShort(row.left)} ${copy.t("remaining")}`}
                detail={`${copy.t(c.dueLine)} · ${row.bookingId}`}
                onClick={() => {
                  setStandalone(false);
                  setSelectedId(row.bookingId);
                }}
              />
            );
          })}
          <MoneyOpt
            selected={standalone}
            title={copy.t("Something not tied to a booking")}
            detail={copy.t("You write what it is for. No appointment is created.")}
            onClick={() => {
              setStandalone(true);
              setSelectedId(null);
            }}
          />
          {standalone ? (
            <MoneyField
              label={copy.t("What it is for · shown to the client")}
              value={purpose}
              onChange={setPurpose}
              placeholder={copy.t("Purpose")}
            />
          ) : null}
          <MoneyNote>
            {copy.t("Only work with an amount still unpaid is listed.")}
          </MoneyNote>
        </MoneyTaskSheet>
        {toast ? <MoneyToast message={toast} /> : null}
      </>
    );
  }

  if (step === "amount" && selected && chrome) {
    return (
      <>
        <MoneyTaskSheet
          data-money-sheet="mc_req_amount"
          title={copy.t("Request payment")}
          subtitle={`${copy.t("Step 2 of 3")} · ${selected.clientName}`}
          onClose={onClose}
          footer={
            <>
              <MoneySheetBtn
                label={copy.t("Back")}
                onClick={() => (prefill ? onClose() : setStep("pick"))}
              />
              <MoneySheetBtn
                label={copy.t("Create request")}
                primary
                disabled={!canCreate}
                onClick={() => setStep("created")}
              />
            </>
          }
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <MoneyAvatar
              initials={selected.clientName
                .split(/\s+/)
                .map((p) => p[0] ?? "")
                .join("")
                .slice(0, 2)
                .toUpperCase()}
              size={38}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{selected.clientName}</div>
              <div style={{ fontSize: 13.5, color: COLORS.inkMuted }}>
                {copy.t(chrome.serviceLabel)} · {copy.t("agreed")} {formatMoneyShort(selected.agreed)}{" "}
                · {copy.t("Paid so far").toLowerCase()} {formatMoneyShort(selected.paid)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.inkMuted }}>
            {copy.t("Amount")}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setAmountKind("remaining")}
              style={amountCardStyle(amountKind === "remaining")}
            >
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{copy.t("Remaining balance")}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                {formatMoneyMajor(selected.left, currency)}
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {copy.t("After payment, $0 remains")}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setAmountKind("other")}
              style={amountCardStyle(amountKind === "other")}
            >
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{copy.t("Other amount")}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                {amountKind === "other" && amount > 0 ? formatMoneyMajor(amount, currency) : "—"}
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 2 }}>
                {copy.t("You type it")}
              </div>
            </button>
          </div>
          {amountKind === "other" ? (
            <MoneyField
              label={copy.t("Other amount")}
              value={otherAmount}
              onChange={setOtherAmount}
              prefix="$"
              suffix={currency}
              type="number"
              hint={`${copy.t("Between")} $1 ${copy.t("and")} ${formatMoneyShort(selected.left)}.`}
            />
          ) : null}
          <MoneyField
            label={copy.t("What it is for · shown to the client")}
            value={`${copy.t(chrome.serviceLabel)} · ${selected.bookingId}`}
            onChange={() => {}}
          />
          <MoneyNote>
            {copy.t("Creating the request does not send it. You choose how to share it next.")}
          </MoneyNote>
        </MoneyTaskSheet>
        {toast ? <MoneyToast message={toast} /> : null}
      </>
    );
  }

  // created / share
  const payUrl = `https://pay.tulala.digital/r/${linkCode}`;
  return (
    <>
      <MoneyTaskSheet
        data-money-sheet="mc_req_created"
        title={copy.t("Request payment")}
        subtitle={copy.t("Step 3 of 3 · created")}
        onClose={onClose}
        footer={
          <>
            <span style={{ flex: 1, fontSize: 13.5, color: COLORS.inkMuted }}>
              {copy.t("Sending does not mark it paid.")}
            </span>
            <MoneySheetBtn
              label={copy.t("Done, share later")}
              onClick={() => finish(false)}
            />
            <MoneySheetBtn
              label={
                shareHow === "messages"
                  ? copy.t("Send in Messages")
                  : copy.t("Open WhatsApp")
              }
              primary
              onClick={() => {
                if (shareHow === "whatsapp") {
                  const text = encodeURIComponent(
                    `${copy.t("Hi")} ${selected?.clientName ?? ""}, ${formatMoneyMajor(amount, currency)}: ${payUrl}`,
                  );
                  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
                }
                finish(shareHow === "messages");
              }}
            />
          </>
        }
      >
        <div
          style={{
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>
              {copy.t("Payment request")} · {selected?.clientName}
            </span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatMoneyMajor(amount, currency)}
            </span>
          </div>
          <div style={{ fontSize: 13.5, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
            {chrome ? copy.t(chrome.serviceLabel) : ""} · {selected?.bookingId}
            <br />
            {copy.t("Awaiting payment · not sent yet")}
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.inkMuted }}>
          {copy.t("Share it")}
        </div>
        <MoneyOpt
          selected={shareHow === "messages"}
          title={copy
            .t("Send in conversation with {name}")
            .replace("{name}", selected?.clientName ?? "")}
          detail={copy.t("Arrives in Tulala Messages; you will see when it is delivered.")}
          onClick={() => setShareHow("messages")}
        />
        <MoneyOpt
          selected={shareHow === "whatsapp"}
          title={copy.t("WhatsApp")}
          detail={copy.t("Opens WhatsApp with this text. Tulala cannot see whether you sent it.")}
          onClick={() => setShareHow("whatsapp")}
        />
        <div
          style={{
            background: "rgba(11,11,13,0.04)",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 14.5,
            lineHeight: 1.5,
            fontFamily: FONTS.body,
          }}
        >
          {copy.t("Hi")} {selected?.clientName}, {copy.t("here is the link for")}{" "}
          {chrome ? copy.t(chrome.serviceLabel) : ""}, {formatMoneyMajor(amount, currency)}: {payUrl}
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(payUrl);
              setToast(copy.t("Copied"));
            }}
            style={linkBtnStyle}
          >
            {copy.t("Copy link")}
          </button>
        </div>
      </MoneyTaskSheet>
      {toast ? <MoneyToast message={toast} /> : null}
    </>
  );
}

function amountCardStyle(selected: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 140,
    padding: "12px 14px",
    borderRadius: 12,
    border: selected ? `2px solid ${COLORS.indigoDeep}` : `1px solid ${COLORS.border}`,
    background: selected ? COLORS.indigoSoft : "#fff",
    cursor: "pointer",
    textAlign: "left" as const,
    fontFamily: FONTS.body,
  };
}

const linkBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: COLORS.indigoDeep,
  fontWeight: 600,
  fontSize: 13.5,
  cursor: "pointer",
  fontFamily: FONTS.body,
};
