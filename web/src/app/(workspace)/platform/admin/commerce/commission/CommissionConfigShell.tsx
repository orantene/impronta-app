"use client";

import * as React from "react";
import { updatePlatformCommissionConfig, type CommissionConfig } from "./actions";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

const HQ = {
  bg:         "#0F0F11",
  card:       "#16161A",
  cardSoft:   "rgba(255,255,255,0.04)",
  border:     "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink:        "#F5F2EB",
  inkMuted:   "rgba(245,242,235,0.62)",
  inkDim:     "rgba(245,242,235,0.38)",
  green:      "#5DD3A0",
  amber:      "#F0B461",
  red:        "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';

const PLAN_TIERS = ["free", "studio", "agency", "network"] as const;
type PlanTier = (typeof PLAN_TIERS)[number];

// ─── Helpers ───────────────────────────────────────────────────────────────

function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

function percentToBps(pct: string): number | null {
  const n = parseFloat(pct);
  if (!isFinite(n) || n < 0 || n > 50) return null;
  return Math.round(n * 100);
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.?0+$/, "");
}

function dollarsToCents(val: string): number | null {
  const n = parseFloat(val);
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// ─── Shell ─────────────────────────────────────────────────────────────────

export function CommissionConfigShell({ initial }: { initial: CommissionConfig }) {
  const t = useT();
  // Default take
  const [defaultPct, setDefaultPct] = React.useState(
    bpsToPercent(initial.defaultTakeBps),
  );
  const [floorDollars, setFloorDollars] = React.useState(
    centsToDollars(initial.defaultTakeFloorCents),
  );
  // Client-side share of the total take (blank = even split of the total).
  const [clientSurchargePct, setClientSurchargePct] = React.useState(
    initial.clientSurchargeBps != null ? bpsToPercent(initial.clientSurchargeBps) : "",
  );
  // Platform caps on a workspace base reservation fee (blank = uncapped).
  const [maxBaseFeeDollars, setMaxBaseFeeDollars] = React.useState(
    initial.maxBaseFeeCents != null ? centsToDollars(initial.maxBaseFeeCents) : "",
  );
  const [maxBaseFeePct, setMaxBaseFeePct] = React.useState(
    initial.maxBaseFeeBps != null ? bpsToPercent(initial.maxBaseFeeBps) : "",
  );

  // Per-tier overrides: empty string = inherit default (omit from payload)
  const [tierPcts, setTierPcts] = React.useState<Record<PlanTier, string>>({
    free:    initial.planTierBps.free    != null ? bpsToPercent(initial.planTierBps.free)    : "",
    studio:  initial.planTierBps.studio  != null ? bpsToPercent(initial.planTierBps.studio)  : "",
    agency:  initial.planTierBps.agency  != null ? bpsToPercent(initial.planTierBps.agency)  : "",
    network: initial.planTierBps.network != null ? bpsToPercent(initial.planTierBps.network) : "",
  });

  const [pending, startTransition] = React.useTransition();
  const [msg, setMsg] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function handleSave() {
    setMsg(null);

    const defaultBps = percentToBps(defaultPct);
    if (defaultBps === null) {
      setMsg({ tone: "err", text: t("dashboard.platform.billing.commission.errDefaultRange") });
      return;
    }

    const floorCents = dollarsToCents(floorDollars);
    if (floorCents === null) {
      setMsg({ tone: "err", text: t("dashboard.platform.billing.commission.errFloor") });
      return;
    }

    let clientSurchargeBps: number | null = null;
    const csbRaw = clientSurchargePct.trim();
    if (csbRaw !== "") {
      const csb = percentToBps(csbRaw);
      if (csb === null) {
        setMsg({ tone: "err", text: t("dashboard.platform.billing.commission.errSurcharge") });
        return;
      }
      clientSurchargeBps = csb;
    }

    let maxBaseFeeCents: number | null = null;
    const mfdRaw = maxBaseFeeDollars.trim();
    if (mfdRaw !== "") {
      const mfc = dollarsToCents(mfdRaw);
      if (mfc === null) {
        setMsg({ tone: "err", text: t("dashboard.platform.billing.commission.errMaxFlat") });
        return;
      }
      maxBaseFeeCents = mfc;
    }

    let maxBaseFeeBps: number | null = null;
    const mfpRaw = maxBaseFeePct.trim();
    if (mfpRaw !== "") {
      const mfp = percentToBps(mfpRaw);
      if (mfp === null) {
        setMsg({ tone: "err", text: t("dashboard.platform.billing.commission.errMaxPct") });
        return;
      }
      maxBaseFeeBps = mfp;
    }

    const planTierBps: Record<string, number> = {};
    for (const tier of PLAN_TIERS) {
      const raw = tierPcts[tier].trim();
      if (raw === "") continue; // blank = inherit default
      const bps = percentToBps(raw);
      if (bps === null) {
        setMsg({ tone: "err", text: interpolate(t("dashboard.platform.billing.commission.errTier"), { tier }) });
        return;
      }
      planTierBps[tier] = bps;
    }

    startTransition(async () => {
      const res = await updatePlatformCommissionConfig({
        defaultTakeBps: defaultBps,
        defaultTakeFloorCents: floorCents,
        clientSurchargeBps,
        maxBaseFeeCents,
        maxBaseFeeBps,
        planTierBps,
      });
      if (res.ok) {
        setMsg({ tone: "ok", text: t("dashboard.platform.billing.commission.savedOk") });
      } else {
        setMsg({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: F }}>
      {/* Info banner — per-participant grain is live; tier rates now safe */}
      <div
        style={{
          background: "rgba(93,211,160,0.08)",
          border: "1px solid rgba(93,211,160,0.28)",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>●</span>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: HQ.green, marginBottom: 4 }}>
            {t("dashboard.platform.billing.commission.grainTitle")}
          </div>
          <div style={{ fontSize: 12, color: HQ.inkMuted, lineHeight: 1.55 }}>
            {t("dashboard.platform.billing.commission.grainBody")}
          </div>
        </div>
      </div>

      {/* Default take */}
      <section
        style={{
          background: HQ.card,
          border: `1px solid ${HQ.borderSoft}`,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.9,
            textTransform: "uppercase",
            color: HQ.inkDim,
            marginBottom: 14,
          }}
        >
          {t("dashboard.platform.billing.commission.platformDefault")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("dashboard.platform.billing.commission.defaultTakeRate")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={0}
                max={50}
                step={0.01}
                value={defaultPct}
                disabled={pending}
                onChange={(e) => setDefaultPct(e.target.value)}
                style={inputStyle()}
              />
              <span style={{ fontSize: 12, color: HQ.inkMuted, whiteSpace: "nowrap" }}>
                = {defaultPct !== "" ? `${defaultPct}%` : "—"}
              </span>
            </div>
            <span style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4 }}>
              {t("dashboard.platform.billing.commission.defaultTakeHint")}
            </span>
          </Field>
          <Field label={t("dashboard.platform.billing.commission.floor")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: HQ.inkMuted }}>$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={floorDollars}
                disabled={pending}
                onChange={(e) => setFloorDollars(e.target.value)}
                style={inputStyle()}
              />
            </div>
            <span style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4 }}>
              {t("dashboard.platform.billing.commission.floorHint")}
            </span>
          </Field>
          <Field label={t("dashboard.platform.billing.commission.clientSurcharge")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={0}
                max={50}
                step={0.01}
                placeholder={t("dashboard.platform.billing.commission.clientSurchargePlaceholder")}
                value={clientSurchargePct}
                disabled={pending}
                onChange={(e) => setClientSurchargePct(e.target.value)}
                style={inputStyle()}
              />
              <span style={{ fontSize: 12, color: HQ.inkMuted, whiteSpace: "nowrap" }}>
                {clientSurchargePct !== ""
                  ? `${clientSurchargePct}%`
                  : t("dashboard.platform.billing.commission.clientSurchargeEven")}
              </span>
            </div>
            <span style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4 }}>
              {t("dashboard.platform.billing.commission.clientSurchargeHint")}
            </span>
          </Field>
        </div>
      </section>

      {/* Base reservation fee caps */}
      <section
        style={{
          background: HQ.card,
          border: `1px solid ${HQ.borderSoft}`,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.9,
            textTransform: "uppercase",
            color: HQ.inkDim,
            marginBottom: 4,
          }}
        >
          {t("dashboard.platform.billing.commission.baseCapsTitle")}
        </div>
        <p style={{ fontSize: 12, color: HQ.inkMuted, margin: "0 0 14px" }}>
          {t("dashboard.platform.billing.commission.baseCapsBody")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("dashboard.platform.billing.commission.maxFlatFee")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: HQ.inkMuted }}>$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder={t("dashboard.platform.billing.commission.uncapped")}
                value={maxBaseFeeDollars}
                disabled={pending}
                onChange={(e) => setMaxBaseFeeDollars(e.target.value)}
                style={inputStyle()}
              />
            </div>
            <span style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4 }}>
              {t("dashboard.platform.billing.commission.maxFlatFeeHint")}
            </span>
          </Field>
          <Field label={t("dashboard.platform.billing.commission.maxPctFee")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={0}
                max={50}
                step={0.01}
                placeholder={t("dashboard.platform.billing.commission.uncapped")}
                value={maxBaseFeePct}
                disabled={pending}
                onChange={(e) => setMaxBaseFeePct(e.target.value)}
                style={inputStyle()}
              />
              <span style={{ fontSize: 12, color: HQ.inkMuted, whiteSpace: "nowrap" }}>
                {maxBaseFeePct !== "" ? `${maxBaseFeePct}%` : "—"}
              </span>
            </div>
            <span style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4 }}>
              {t("dashboard.platform.billing.commission.maxPctFeeHint")}
            </span>
          </Field>
        </div>
      </section>

      {/* Per-tier overrides */}
      <section
        style={{
          background: HQ.card,
          border: `1px solid ${HQ.borderSoft}`,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.9,
            textTransform: "uppercase",
            color: HQ.inkDim,
            marginBottom: 4,
          }}
        >
          {t("dashboard.platform.billing.commission.overridesTitle")}
        </div>
        <p style={{ fontSize: 12, color: HQ.inkMuted, margin: "0 0 14px" }}>
          {t("dashboard.platform.billing.commission.overridesBody")}
        </p>
        <div
          style={{
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 0,
              padding: "8px 14px",
              background: HQ.cardSoft,
              borderBottom: `1px solid ${HQ.borderSoft}`,
            }}
          >
            {[
              t("dashboard.platform.billing.commission.colPlanTier"),
              t("dashboard.platform.billing.commission.colTakeRate"),
              t("dashboard.platform.billing.commission.colEffectiveBps"),
            ].map((h) => (
              <span
                key={h}
                style={{ fontSize: 10.5, fontWeight: 600, color: HQ.inkDim, letterSpacing: 0.4 }}
              >
                {h}
              </span>
            ))}
          </div>
          {PLAN_TIERS.map((tier, idx) => {
            const pct = tierPcts[tier];
            const bps = pct.trim() !== "" ? percentToBps(pct) : null;
            return (
              <div
                key={tier}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 0,
                  padding: "10px 14px",
                  borderTop: idx === 0 ? "none" : `1px solid ${HQ.borderSoft}`,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: HQ.ink,
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                >
                  {tier}
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.01}
                  placeholder={t("dashboard.platform.billing.commission.inheritPlaceholder")}
                  value={pct}
                  disabled={pending}
                  onChange={(e) =>
                    setTierPcts((prev) => ({ ...prev, [tier]: e.target.value }))
                  }
                  style={{ ...inputStyle(), maxWidth: 140 }}
                />
                <span style={{ fontSize: 12, color: bps != null ? HQ.green : HQ.inkDim }}>
                  {bps != null
                    ? interpolate(t("dashboard.platform.billing.commission.effectiveBps"), { bps })
                    : t("dashboard.platform.billing.commission.inheritDash")}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          style={{
            background: HQ.green,
            color: "#0F0F11",
            border: "none",
            padding: "9px 18px",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 700,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.6 : 1,
            fontFamily: F,
          }}
        >
          {pending
            ? t("dashboard.platform.billing.commission.saving")
            : t("dashboard.platform.billing.commission.saveConfig")}
        </button>
        <span style={{ fontSize: 11.5, color: HQ.inkDim }}>
          {t("dashboard.platform.billing.commission.saveNote")}
        </span>
      </div>

      {/* Feedback */}
      {msg && (
        <div
          role={msg.tone === "ok" ? "status" : "alert"}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            background: msg.tone === "ok" ? "rgba(93,211,160,0.08)" : "rgba(243,103,114,0.08)",
            color: msg.tone === "ok" ? HQ.green : HQ.red,
            border: `1px solid ${msg.tone === "ok" ? "rgba(93,211,160,0.25)" : "rgba(243,103,114,0.25)"}`,
            fontFamily: F,
          }}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ─── Atoms ─────────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: HQ.inkMuted, letterSpacing: 0.2 }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: HQ.cardSoft,
    border: `1px solid ${HQ.border}`,
    color: HQ.ink,
    padding: "7px 10px",
    borderRadius: 7,
    fontSize: 13,
    fontFamily: F,
    outline: "none",
    width: "100%",
  };
}
