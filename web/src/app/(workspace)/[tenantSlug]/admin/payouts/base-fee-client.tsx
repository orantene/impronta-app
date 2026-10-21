"use client";

import * as React from "react";
import { createTranslator } from "@/i18n/messages";
import { saveWorkspaceBaseFee, type WorkspaceBaseFeeState } from "./base-fee-actions";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.6)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.10)",
  coral:      "#B0303A",
  coralSoft:  "rgba(176,48,58,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function centsToDollars(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(/\.?0+$/, "");
}
function dollarsToCents(val: string): number | null {
  const n = parseFloat(val);
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function bpsToPercent(bps: number | null): string {
  if (bps == null) return "";
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}
function percentToBps(pct: string): number | null {
  const n = parseFloat(pct);
  if (!isFinite(n) || n < 0 || n > 50) return null;
  return Math.round(n * 100);
}

export function BaseFeeClient({
  tenantSlug,
  initial,
  locale = "en",
}: {
  tenantSlug: string;
  initial: WorkspaceBaseFeeState;
  locale?: string;
}) {
  const t = createTranslator(locale);
  const [flat, setFlat] = React.useState(centsToDollars(initial.baseFeeCents));
  const [pct, setPct] = React.useState(bpsToPercent(initial.baseFeeBps));
  const [pending, startTransition] = React.useTransition();
  const [msg, setMsg] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const capFlat = initial.maxBaseFeeCents;
  const capBps = initial.maxBaseFeeBps;

  function handleSave() {
    setMsg(null);

    let baseFeeCents: number | null = null;
    const flatRaw = flat.trim();
    if (flatRaw !== "") {
      const c = dollarsToCents(flatRaw);
      if (c === null) {
        setMsg({ tone: "err", text: t("admin.payouts.baseFee.errFlat") });
        return;
      }
      baseFeeCents = c;
    }

    let baseFeeBps: number | null = null;
    const pctRaw = pct.trim();
    if (pctRaw !== "") {
      const b = percentToBps(pctRaw);
      if (b === null) {
        setMsg({ tone: "err", text: t("admin.payouts.baseFee.errPct") });
        return;
      }
      baseFeeBps = b;
    }

    if (capFlat != null && baseFeeCents != null && baseFeeCents > capFlat) {
      setMsg({ tone: "err", text: t("admin.payouts.baseFee.errCapFlat").replace("{amount}", `$${centsToDollars(capFlat)}`) });
      return;
    }
    if (capBps != null && baseFeeBps != null && baseFeeBps > capBps) {
      setMsg({ tone: "err", text: t("admin.payouts.baseFee.errCapPct").replace("{pct}", bpsToPercent(capBps)) });
      return;
    }

    startTransition(async () => {
      const res = await saveWorkspaceBaseFee(tenantSlug, { baseFeeCents, baseFeeBps });
      if (res.ok) {
        setMsg({ tone: "ok", text: t("admin.payouts.baseFee.saved") });
      } else {
        setMsg({ tone: "err", text: res.error });
      }
    });
  }

  const inputStyle: React.CSSProperties = {
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    color: C.ink,
    padding: "7px 10px",
    borderRadius: 7,
    fontSize: 13,
    fontFamily: FONT,
    outline: "none",
    width: "100%",
  };

  return (
    <section
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        fontFamily: FONT,
        color: C.ink,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {t("admin.payouts.baseFee.title")}
      </div>
      <p style={{ fontSize: 12, color: C.inkMuted, margin: "0 0 16px", lineHeight: 1.55 }}>
        {t("admin.payouts.baseFee.body")}
        {(capFlat != null || capBps != null) && (
          <>
            {" "}{t("admin.payouts.baseFee.capsLead")}{" "}
            {capFlat != null
              ? t("admin.payouts.baseFee.capFlat").replace("{amount}", `$${centsToDollars(capFlat)}`)
              : t("admin.payouts.baseFee.capFlatNone")}
            {" · "}
            {capBps != null
              ? t("admin.payouts.baseFee.capPct").replace("{pct}", bpsToPercent(capBps))
              : t("admin.payouts.baseFee.capPctNone")}.
          </>
        )}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: C.inkMuted }}>{t("admin.payouts.baseFee.flatLabel")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.inkMuted }}>$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder={t("admin.payouts.baseFee.none")}
              value={flat}
              disabled={pending}
              onChange={(e) => setFlat(e.target.value)}
              style={inputStyle}
            />
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: C.inkMuted }}>{t("admin.payouts.baseFee.pctLabel")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={0}
              max={50}
              step={0.01}
              placeholder={t("admin.payouts.baseFee.none")}
              value={pct}
              disabled={pending}
              onChange={(e) => setPct(e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontSize: 12, color: C.inkMuted }}>
              {pct.trim() !== "" ? `${pct}%` : "—"}
            </span>
          </div>
        </label>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          style={{
            background: C.green,
            color: "#fff",
            border: "none",
            padding: "9px 18px",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.6 : 1,
            fontFamily: FONT,
          }}
        >
          {pending ? t("admin.payouts.baseFee.saving") : t("admin.payouts.baseFee.save")}
        </button>
        <span style={{ fontSize: 11.5, color: C.inkDim }}>
          {t("admin.payouts.baseFee.hint")}
        </span>
      </div>

      {msg && (
        <div
          role={msg.tone === "ok" ? "status" : "alert"}
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            background: msg.tone === "ok" ? C.greenSoft : C.coralSoft,
            color: msg.tone === "ok" ? C.green : C.coral,
          }}
        >
          {msg.text}
        </div>
      )}
    </section>
  );
}
