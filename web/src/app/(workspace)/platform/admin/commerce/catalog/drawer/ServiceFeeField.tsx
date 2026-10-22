"use client";

/**
 * ServiceFeeField (TUL-1366): the Tulala service fee % for this plan, shown in
 * the tier drawer right under the plan prices. Platform admin only (the action
 * enforces it; this screen is already behind the platform admin layout).
 * 0-20%, default 1.5%. A change applies to checkouts quoted from now on; orders
 * already priced keep the fee they were quoted with.
 */

import { useState, useTransition } from "react";
import { updateTierServiceFee } from "@/lib/server-actions/admin-tier-service-fee";
import { useT } from "@/i18n/use-t";
import { HQ, F } from "../../_tokens";
import { SectionLabel, Field, inputStyle } from "../../_primitives";

export function ServiceFeeField({ tierId, feeBps }: { tierId: string; feeBps: number | null }) {
  const t = useT();
  const initial = feeBps == null ? "" : String(feeBps / 100);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const parsed = value.trim() === "" ? NaN : Number(value);
  const inRange = Number.isFinite(parsed) && parsed >= 0 && parsed <= 20;
  const dirty = value !== saved;

  // Not available until the service-fee migration is applied.
  if (feeBps == null) {
    return (
      <div style={{ marginTop: 18 }}>
        <SectionLabel title={t("dashboard.platform.pricing.drawer.serviceFee.label")} />
        <p style={{ fontFamily: F, fontSize: 12, color: HQ.inkMuted, margin: "6px 0 0" }}>
          {t("dashboard.platform.pricing.drawer.serviceFee.notReady")}
        </p>
      </div>
    );
  }

  const save = () => {
    setMsg(null);
    if (!inRange) {
      setMsg({ ok: false, text: t("dashboard.platform.pricing.drawer.serviceFee.range") });
      return;
    }
    startTransition(async () => {
      const r = await updateTierServiceFee({ tierId, feePercent: parsed });
      if (r.ok) {
        setSaved(value);
        setMsg({ ok: true, text: t("dashboard.platform.pricing.drawer.serviceFee.saved") });
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  };

  return (
    <div style={{ marginTop: 18 }} data-testid="tier-service-fee">
      <SectionLabel title={t("dashboard.platform.pricing.drawer.serviceFee.label")} />
      <p style={{ fontFamily: F, fontSize: 12, color: HQ.inkMuted, margin: "4px 0 10px", lineHeight: 1.5 }}>
        {t("dashboard.platform.pricing.drawer.serviceFee.help")}
      </p>
      <Field label={t("dashboard.platform.pricing.drawer.serviceFee.field")}>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={20}
          step={0.05}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMsg(null);
          }}
          aria-label={t("dashboard.platform.pricing.drawer.serviceFee.field")}
          style={{ ...inputStyle, width: 110 }}
        />
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          style={{
            background: dirty ? HQ.ink : "transparent",
            color: dirty ? HQ.bg : HQ.inkMuted,
            border: dirty ? "none" : `1px solid ${HQ.borderHover}`,
            borderRadius: 6,
            padding: "8px 14px",
            fontFamily: F,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: !dirty || pending ? "default" : "pointer",
          }}
        >
          {pending
            ? t("dashboard.platform.pricing.drawer.serviceFee.saving")
            : t("dashboard.platform.pricing.drawer.serviceFee.save")}
        </button>
        {msg && <span style={{ fontSize: 11.5, color: msg.ok ? HQ.green : HQ.red }}>{msg.text}</span>}
      </div>
    </div>
  );
}
