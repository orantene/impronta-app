"use client";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import { useResolvedTalentEarnings } from "./use-resolved-talent-earnings";

function KpiCard({
  label,
  value,
  caption,
  tone = "ink",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "ink" | "success" | "indigo";
}) {
  const toneFg =
    tone === "success" ? COLORS.successDeep : tone === "indigo" ? COLORS.indigoDeep : COLORS.ink;
  const toneBg =
    tone === "success" ? COLORS.successSoft : tone === "indigo" ? COLORS.indigoSoft : "rgba(11,11,13,0.04)";

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          alignItems: "center",
          padding: "3px 8px",
          borderRadius: 999,
          background: toneBg,
          color: toneFg,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: -0.4,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.4 }}>{caption}</div>
    </div>
  );
}

export function MoneyKpiStrip() {
  const earnings = useResolvedTalentEarnings();
  const { totals, rows } = earnings;
  const currency = totals.currency;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <KpiCard
          label="YTD net"
          value={formatMoneyCents(totals.ytdNetCents, currency)}
          caption={`${rows.length} booking${rows.length === 1 ? "" : "s"} paid or logged`}
          tone="success"
        />
        <KpiCard
          label="Pending"
          value={formatMoneyCents(totals.pendingCents, currency)}
          caption="Invoiced · awaiting payout"
          tone="indigo"
        />
        <KpiCard
          label="Confirmed pipeline"
          value={formatMoneyCents(totals.confirmedPipelineCents, currency)}
          caption="Booked · not yet invoiced"
        />
      </div>
    </div>
  );
}
