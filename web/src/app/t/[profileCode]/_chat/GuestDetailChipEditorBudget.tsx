"use client";

/**
 * BudgetEditor — the "Budget" kind sub-editor for GuestDetailChipEditor.
 * Extracted verbatim from GuestDetailChipEditor.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import { useState, useId } from "react";
import type { Translator } from "@/i18n/interpolate";
import { primaryBtnStyle, type Palette } from "./mini-chat-styles";
import a11y from "./mini-chat-a11y.module.css";
import type { GuestChipValue } from "@/lib/inquiry/guest-chat-contract";
import {
  editorWrap,
  footerStyle,
  ghostBtnStyle,
  labelStyle,
  rowStyle,
  smallInputStyle,
  toggleStyle,
} from "./guest-detail-chip-editor-styles";

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "MXN", "CAD", "AUD"];

type BudgetPreference =
  | "agency_recommends"
  | "total_budget"
  | "per_hour"
  | "per_day"
  | "per_week"
  | "per_contract"
  | "per_talent"
  | "not_sure";

export function BudgetEditor({
  initial,
  accent,
  accentInk,
  t,
  C,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<GuestChipValue> | null;
  accent: string;
  accentInk: string;
  t: Translator;
  C: Palette;
  onSubmit: (v: GuestChipValue) => void;
  onCancel: () => void;
}) {
  const [preference, setPreference] = useState<BudgetPreference>(
    (initial?.budgetPreference as BudgetPreference) ?? "not_sure",
  );
  const [amount, setAmount] = useState<string>(
    initial?.budgetAmount !== null && initial?.budgetAmount !== undefined
      ? String(initial.budgetAmount)
      : "",
  );
  const [currency, setCurrency] = useState<string>(initial?.currency ?? "USD");
  const amountId = useId();
  const currencyId = useId();

  const preferenceOptions: { value: BudgetPreference; label: string }[] = [
    { value: "total_budget", label: t("public.guestChat.budgetTotal") },
    { value: "per_hour", label: t("public.guestChat.budgetPerHour") },
    { value: "per_day", label: t("public.guestChat.budgetPerDay") },
    { value: "per_talent", label: t("public.guestChat.budgetPerTalent") },
    { value: "agency_recommends", label: t("public.guestChat.budgetAgencyRecommends") },
    { value: "not_sure", label: t("public.guestChat.budgetNotSure") },
  ];

  function handleConfirm() {
    const parsedAmount = parseFloat(amount.replace(/[^0-9.]/g, ""));
    onSubmit({
      budgetPreference: preference,
      budgetAmount: !Number.isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : null,
      currency: currency || null,
    });
  }

  const showAmount =
    preference !== "not_sure" && preference !== "agency_recommends";

  return (
    <div style={editorWrap(C)}>
      <span style={labelStyle(C)}>{t("public.guestChat.editorBudgetLabel")}</span>
      <div style={rowStyle}>
        {preferenceOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={toggleStyle(preference === opt.value, accent, C)}
            onClick={() => setPreference(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {showAmount && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div>
            <label htmlFor={currencyId} style={{ display: "none" }}>
              {t("public.guestChat.budgetCurrencyAria")}
            </label>
            <select
              id={currencyId}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={a11y.focusRing}
              style={{
                ...smallInputStyle(C, accent),
                width: 76,
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
              }}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor={amountId} style={{ display: "none" }}>
              {t("public.guestChat.budgetAmountAria")}
            </label>
            <input
              id={amountId}
              type="number"
              min={0}
              placeholder={t("public.guestChat.budgetAmountPlaceholder")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={a11y.focusRing}
              style={{ ...smallInputStyle(C, accent), width: "100%" }}
            />
          </div>
        </div>
      )}
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle(C)} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          style={{ ...primaryBtnStyle(accent, accentInk), height: 32, padding: "0 14px", fontSize: 12 }}
          onClick={handleConfirm}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}
