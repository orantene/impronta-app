"use client";

import * as React from "react";
import { updatePlatformCommissionConfig, type CommissionConfig } from "./actions";

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
      setMsg({ tone: "err", text: "Default take must be between 0% and 50%." });
      return;
    }

    const floorCents = dollarsToCents(floorDollars);
    if (floorCents === null) {
      setMsg({ tone: "err", text: "Floor must be 0 or a positive dollar amount." });
      return;
    }

    let clientSurchargeBps: number | null = null;
    const csbRaw = clientSurchargePct.trim();
    if (csbRaw !== "") {
      const csb = percentToBps(csbRaw);
      if (csb === null) {
        setMsg({ tone: "err", text: "Client surcharge must be between 0% and 50%, or blank for an even split." });
        return;
      }
      clientSurchargeBps = csb;
    }

    const planTierBps: Record<string, number> = {};
    for (const tier of PLAN_TIERS) {
      const raw = tierPcts[tier].trim();
      if (raw === "") continue; // blank = inherit default
      const bps = percentToBps(raw);
      if (bps === null) {
        setMsg({ tone: "err", text: `${tier} take must be between 0% and 50%, or leave blank to inherit the default.` });
        return;
      }
      planTierBps[tier] = bps;
    }

    startTransition(async () => {
      const res = await updatePlatformCommissionConfig({
        defaultTakeBps: defaultBps,
        defaultTakeFloorCents: floorCents,
        clientSurchargeBps,
        planTierBps,
      });
      if (res.ok) {
        setMsg({ tone: "ok", text: "Commission config saved." });
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
            Per-participant commission grain is live
          </div>
          <div style={{ fontSize: 12, color: HQ.inkMuted, lineHeight: 1.55 }}>
            As of ADR 2026-05-22, commission resolves per `inquiry_participants`
            row from each talent&apos;s frozen `owning_party_*`. Tier-specific rates
            and per-tenant overrides now resolve correctly for cross-tenant inquiries
            — safe to populate.
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
          Platform default
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Default take rate (%)">
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
              Stored as basis points (bps). 5% = 500 bps.
            </span>
          </Field>
          <Field label="Floor ($ USD)">
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
              Platform fee = max(% take, floor). 0 = no floor.
            </span>
          </Field>
          <Field label="Client surcharge (% of subtotal)">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={0}
                max={50}
                step={0.01}
                placeholder="even split"
                value={clientSurchargePct}
                disabled={pending}
                onChange={(e) => setClientSurchargePct(e.target.value)}
                style={inputStyle()}
              />
              <span style={{ fontSize: 12, color: HQ.inkMuted, whiteSpace: "nowrap" }}>
                {clientSurchargePct !== "" ? `${clientSurchargePct}%` : "even"}
              </span>
            </div>
            <span style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4 }}>
              The client-side half, added on top of the subtotal. Blank = even
              split. With a 6% take, 3% here = 3% client + 3% seller. The talent
              is never charged.
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
          Per-plan-tier overrides
        </div>
        <p style={{ fontSize: 12, color: HQ.inkMuted, margin: "0 0 14px" }}>
          Leave blank to inherit the default rate above. Non-blank values override
          the default for that plan tier only.
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
            {["Plan tier", "Take rate (%)", "Effective bps"].map((h) => (
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
                  placeholder="inherit default"
                  value={pct}
                  disabled={pending}
                  onChange={(e) =>
                    setTierPcts((prev) => ({ ...prev, [tier]: e.target.value }))
                  }
                  style={{ ...inputStyle(), maxWidth: 140 }}
                />
                <span style={{ fontSize: 12, color: bps != null ? HQ.green : HQ.inkDim }}>
                  {bps != null ? `${bps} bps` : "— (inherit)"}
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
          {pending ? "Saving…" : "Save config"}
        </button>
        <span style={{ fontSize: 11.5, color: HQ.inkDim }}>
          Writes the singleton row immediately. Resolver uses the new rates on the
          next booking commission computation.
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
