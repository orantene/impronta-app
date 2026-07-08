"use client";

import { useState, useTransition } from "react";

import { updatePlatformCommercialDefaults } from "../tenants/commercial-terms-actions";
import {
  REFUND_POLICY_LABEL_KEYS,
  REFUND_POLICY_DESCRIPTION_KEYS,
  type RefundPolicyKey,
} from "@/lib/billing/commercial-terms-types";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

/**
 * Super-admin control for the platform-wide commercial booking defaults (the
 * `platform_settings` singleton): the base deposit %, refund-policy preset, and
 * instant-book default that the resolver falls back to when neither a tenant nor
 * a talent has set a value. CONFIGURATION LAYER ONLY — no money flow.
 */
const POLICY_KEYS: RefundPolicyKey[] = ["tiered", "flexible", "strict", "manual"];

export function PlatformCommercialDefaultsCard({
  current,
}: {
  current: {
    defaultDepositPct: number;
    defaultRefundPolicy: RefundPolicyKey;
    instantBookDefault: boolean;
  };
}) {
  const t = useT();
  const [depositPct, setDepositPct] = useState<string>(String(current.defaultDepositPct));
  const [refundPolicy, setRefundPolicy] = useState<RefundPolicyKey>(
    current.defaultRefundPolicy,
  );
  const [instantBook, setInstantBook] = useState<boolean>(current.instantBookDefault);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const parsedPct = parseFloat(depositPct);
  const pctValid = isFinite(parsedPct) && parsedPct >= 0 && parsedPct <= 100;
  const dirty =
    !pctValid ||
    parsedPct !== current.defaultDepositPct ||
    refundPolicy !== current.defaultRefundPolicy ||
    instantBook !== current.instantBookDefault;

  const save = () => {
    setStatus(null);
    if (!pctValid) {
      setStatus({ ok: false, msg: t("dashboard.platform.settings.depositRangeError") });
      return;
    }
    startTransition(async () => {
      const r = await updatePlatformCommercialDefaults({
        defaultDepositPct: parsedPct,
        defaultRefundPolicy: refundPolicy,
        instantBookDefault: instantBook,
      });
      setStatus(
        r.ok
          ? { ok: true, msg: t("dashboard.platform.settings.commercialSaved") }
          : { ok: false, msg: interpolate(t("dashboard.platform.settings.failed"), { error: r.error }) },
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 300 }}>
        <span style={{ fontWeight: 600 }}>{t("dashboard.platform.settings.depositFieldLabel")}</span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={depositPct}
          onChange={(e) => setDepositPct(e.target.value)}
          style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #d8d8de", fontSize: 13 }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 360 }}>
        <span style={{ fontWeight: 600 }}>{t("dashboard.platform.settings.refundPolicyFieldLabel")}</span>
        <select
          value={refundPolicy}
          onChange={(e) => setRefundPolicy(e.target.value as RefundPolicyKey)}
          style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #d8d8de", fontSize: 13 }}
        >
          {POLICY_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(REFUND_POLICY_LABEL_KEYS[k])}
            </option>
          ))}
        </select>
        <span style={{ color: "#6b6b76", marginTop: 2, lineHeight: 1.45, fontSize: 12 }}>
          {t(REFUND_POLICY_DESCRIPTION_KEYS[refundPolicy])}
        </span>
      </label>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", maxWidth: 460 }}>
        <input
          type="checkbox"
          checked={instantBook}
          onChange={(e) => setInstantBook(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          <span style={{ fontWeight: 600 }}>{t("dashboard.platform.settings.instantBookLabel")}</span>
          <span style={{ display: "block", color: "#6b6b76", marginTop: 2, lineHeight: 1.45 }}>
            {t("dashboard.platform.settings.instantBookHint")}
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
