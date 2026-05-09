"use client";

/**
 * CurrencyPicker — workspace billing currency preference selector.
 *
 * Shows a <select> with all supported currencies (plus "Auto (Stripe detects)").
 * Auto-submits on change via useTransition + setCurrencyPreferenceAction.
 * Shows an inline "Saved" or error message.
 */

import * as React from "react";
import { setCurrencyPreferenceAction } from "./currency-actions";
import { SUPPORTED_CURRENCIES } from "./currency-options";
import { createTranslator } from "@/i18n/messages";

const C = {
  ink:      "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  border:   "rgba(24,24,27,0.08)",
  cardBg:   "#ffffff",
  accent:   "#0F4F3E",
  green:    "#2E7D5B",
  red:      "#c0392b",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function CurrencyPicker({
  tenantSlug,
  currentValue,
  locale = "en",
}: {
  tenantSlug: string;
  currentValue: string | null;
  locale?: string;
}) {
  const t = createTranslator(locale);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.currentTarget.value;
    setStatus("saving");
    setErrorMsg(null);
    startTransition(async () => {
      const result = await setCurrencyPreferenceAction(tenantSlug, value);
      if (result.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setErrorMsg(result.error ?? "Failed to save.");
      }
    });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        fontFamily: FONT,
      }}
    >
      <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>
        {t("admin.account.currency.label")}
      </span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select
            defaultValue={currentValue ?? ""}
            onChange={handleChange}
            disabled={pending}
            style={{
              height: 32,
              paddingLeft: 10,
              paddingRight: 28,
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              background: C.cardBg,
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 500,
              color: C.ink,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.7 : 1,
              outline: "none",
              appearance: "auto" as const,
            }}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>

          {status === "saving" && (
            <span style={{ fontSize: 11.5, color: C.inkMuted, fontFamily: FONT }}>
              {t("admin.account.currency.saving")}
            </span>
          )}
          {status === "saved" && (
            <span style={{ fontSize: 11.5, color: C.green, fontFamily: FONT }}>
              {t("admin.account.currency.saved")}
            </span>
          )}
          {status === "error" && (
            <span style={{ fontSize: 11.5, color: C.red, fontFamily: FONT }}>
              {errorMsg}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: C.inkMuted, fontFamily: FONT, lineHeight: 1.4 }}>
          {t("admin.account.currency.hint")}
        </span>
      </div>
    </div>
  );
}
