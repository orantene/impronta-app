"use client";

import { useMemo, useState } from "react";
import { COLORS, FONTS, useAdminShell } from "@/components/admin/shell/internal/state";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { SectionHeader } from "@/components/admin/shell/internal/talent/shared/today-2";
import { formatEurCents, type TalentEarningsRow } from "@/lib/talent/earnings-view";
import { useResolvedTalentEarnings } from "./use-resolved-talent-earnings";

type SourceFilter = "all" | TalentEarningsRow["source"];
type StatusFilter = "all" | TalentEarningsRow["status"];

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "agency_routed", label: "Agency" },
  { key: "personal_page", label: "Personal page" },
  { key: "hub", label: "Hub" },
  { key: "unknown", label: "Other" },
];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All statuses" },
  { key: "paid", label: "Paid" },
  { key: "invoiced", label: "Invoiced" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
];

function sourceLabel(source: TalentEarningsRow["source"]): string {
  if (source === "agency_routed") return "Agency";
  if (source === "personal_page") return "Personal page";
  if (source === "hub") return "Hub";
  return "Other";
}

function statusPalette(status: TalentEarningsRow["status"]): { fg: string; bg: string } {
  if (status === "paid") return { fg: COLORS.successDeep, bg: COLORS.successSoft };
  if (status === "invoiced") return { fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };
  if (status === "confirmed") return { fg: COLORS.royalDeep, bg: COLORS.royalSoft };
  return { fg: COLORS.amberDeep, bg: COLORS.amberSoft };
}

function FilterChip({
  active,
  label,
  onClick,
  size = "md",
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  size?: "md" | "sm";
}) {
  const pad = size === "sm" ? "4px 11px" : "6px 13px";
  const fontSize = size === "sm" ? 11 : 12;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: pad,
        fontSize,
        fontWeight: active ? 600 : 500,
        color: active ? "#fff" : COLORS.ink,
        background: active ? COLORS.fill : "#fff",
        border: active ? "1px solid transparent" : `1px solid ${COLORS.border}`,
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: FONTS.body,
        transition: "background .15s ease, color .15s ease",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function StatusFilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 11px",
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        color: active ? COLORS.ink : COLORS.inkMuted,
        background: active ? "rgba(11,11,13,0.05)" : "transparent",
        border: "none",
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: FONTS.body,
      }}
    >
      {label}
    </button>
  );
}

export function EarningsLedger() {
  const { openDrawer } = useAdminShell();
  const earnings = useResolvedTalentEarnings();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    return earnings.rows.filter((row) => {
      const sourceOk = sourceFilter === "all" || row.source === sourceFilter;
      const statusOk = statusFilter === "all" || row.status === statusFilter;
      return sourceOk && statusOk;
    });
  }, [earnings.rows, sourceFilter, statusFilter]);

  const filteredTotal = filtered.reduce((sum, row) => sum + row.netCents, 0);

  return (
    <section>
      <SectionHeader
        icon="credit"
        iconTone="indigo"
        title="Earnings ledger"
        subtitle="Every closed booking — filter by where it came from and where it is in the cycle."
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {SOURCE_FILTERS.map((chip) => (
          <FilterChip
            key={chip.key}
            active={sourceFilter === chip.key}
            label={chip.label}
            onClick={() => setSourceFilter(chip.key)}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: 12,
        }}
      >
        {STATUS_FILTERS.map((chip) => (
          <StatusFilterChip
            key={chip.key}
            active={statusFilter === chip.key}
            label={chip.label}
            onClick={() => setStatusFilter(chip.key)}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
          paddingLeft: 2,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
            fontFamily: FONTS.body,
          }}
        >
          {sourceFilter === "all" ? "All earnings" : `${sourceLabel(sourceFilter)} earnings`} ·{" "}
          {filtered.length} row{filtered.length === 1 ? "" : "s"}
        </span>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.ink,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatEurCents(filteredTotal)}
        </span>
      </div>

      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
          fontFamily: FONTS.body,
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
              No earnings here yet
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: COLORS.inkMuted }}>
              Once bookings close, your ledger becomes the story of your income.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {filtered.map((row, idx) => {
              const palette = statusPalette(row.status);
              return (
                <li
                  key={row.id}
                  style={{
                    borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openDrawer("talent-earnings-detail", { id: row.id })}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: FONTS.body,
                      transition: "background .12s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.025)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: COLORS.ink,
                          }}
                        >
                          {row.client}
                        </span>
                        <span
                          style={{
                            padding: "2px 7px",
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                            color: palette.fg,
                            background: palette.bg,
                            borderRadius: 999,
                          }}
                        >
                          {row.status}
                        </span>
                        <span
                          style={{
                            padding: "2px 7px",
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                            color: COLORS.inkMuted,
                            background: "rgba(11,11,13,0.05)",
                            borderRadius: 999,
                          }}
                        >
                          {sourceLabel(row.source)}
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11.5,
                          color: COLORS.inkMuted,
                          lineHeight: 1.5,
                        }}
                      >
                        {row.agencyName} · Work {row.workDate}
                        {row.payoutDate ? ` · Paid ${row.payoutDate}` : ""}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: COLORS.ink,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatEurCents(row.netCents)}
                      </div>
                      {row.paymentMethod ? (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 10.5,
                            color: COLORS.inkMuted,
                            textTransform: "capitalize",
                          }}
                        >
                          {row.paymentMethod.replace(/-/g, " ")}
                        </div>
                      ) : null}
                    </div>
                    <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
