"use client";

import { useState, useTransition } from "react";

import { updatePlatformCurrencySettings } from "@/lib/server-actions/admin-platform-currency";
import {
  DEFAULT_CURRENCY_OPTIONS,
  CURRENCY_LABELS,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

/**
 * Super-admin control for the platform currency policy. Sets the operating
 * currency (default USD) and whether talents see multiple currencies (default
 * off → one clean figure, no EUR/USD tabs).
 */
export function PlatformCurrencyCard({
  current,
}: {
  current: { operatingCurrency: string; multiCurrencyDisplayEnabled: boolean };
}) {
  const t = useT();
  const initialCcy: DefaultCurrencyCode = (DEFAULT_CURRENCY_OPTIONS as readonly string[]).includes(
    current.operatingCurrency,
  )
    ? (current.operatingCurrency as DefaultCurrencyCode)
    : "USD";
  const [currency, setCurrency] = useState<DefaultCurrencyCode>(initialCcy);
  const [multi, setMulti] = useState<boolean>(current.multiCurrencyDisplayEnabled);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const dirty = currency !== current.operatingCurrency || multi !== current.multiCurrencyDisplayEnabled;

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const r = await updatePlatformCurrencySettings({
        operatingCurrency: currency,
        multiCurrencyDisplayEnabled: multi,
      });
      setStatus(
        r.ok
          ? {
              ok: true,
              msg: multi
                ? t("dashboard.platform.settings.currencySavedAll")
                : interpolate(t("dashboard.platform.settings.currencySavedOne"), { currency }),
            }
          : { ok: false, msg: interpolate(t("dashboard.platform.settings.failed"), { error: r.error }) },
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 300 }}>
        <span style={{ fontWeight: 600 }}>{t("dashboard.platform.settings.currencyFieldLabel")}</span>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as DefaultCurrencyCode)}
          style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #d8d8de", fontSize: 13 }}
        >
          {DEFAULT_CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c} · {CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", maxWidth: 460 }}>
        <input
          type="checkbox"
          checked={multi}
          onChange={(e) => setMulti(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          <span style={{ fontWeight: 600 }}>{t("dashboard.platform.settings.currencyMultiLabel")}</span>
          <span style={{ display: "block", color: "#6b6b76", marginTop: 2, lineHeight: 1.45 }}>
            {t("dashboard.platform.settings.currencyMultiHint")}
          </span>
        </span>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            background: !dirty || pending ? "#c9c9d1" : "#111118",
            color: "#fff",
            cursor: !dirty || pending ? "default" : "pointer",
          }}
        >
          {pending ? t("dashboard.platform.settings.saving") : t("dashboard.platform.settings.save")}
        </button>
        {status && (
          <span style={{ fontSize: 12.5, color: status.ok ? "#067647" : "#b42318" }}>{status.msg}</span>
        )}
      </div>
    </div>
  );
}
