"use client";

import { COLORS, FONTS, RADIUS } from "@/components/admin/shell/internal/state";
import type { MoneyPaymentRow } from "@/lib/money/money-read-model";
import {
  buildMoneySpineView,
  formatMoneyMajor,
  formatMoneyShort,
  formatSeptemberDay,
  initialsFromName,
  methodLabel,
  refundForPayment,
  type MethodFilter,
} from "@/lib/money/money-spine-view";
import { MoneyAvatar, MoneyFilterChip, MoneyStateChip } from "./money-spine-shared";

export function MoneyPaymentsPanel({
  payments,
  refunds,
  method,
  counts,
  query,
  onMethod,
  onQuery,
  onOpen,
}: {
  payments: MoneyPaymentRow[];
  refunds: ReturnType<typeof buildMoneySpineView>["refunds"];
  method: MethodFilter;
  counts: Record<MethodFilter, number>;
  query: string;
  onMethod: (m: MethodFilter) => void;
  onQuery: (q: string) => void;
  onOpen: (p: MoneyPaymentRow) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div data-money-pay-search style={{ width: 280 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search client or service"
            style={{
              width: "100%",
              height: 38,
              padding: "0 12px",
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              fontSize: 14,
              fontFamily: FONTS.body,
            }}
          />
        </div>
        {(
          [
            ["all", "All methods"],
            ["card", "Card"],
            ["cash", "Cash"],
            ["transfer", "Transfer"],
          ] as const
        ).map(([k, label]) => (
          <MoneyFilterChip
            key={k}
            active={method === k}
            label={label}
            count={counts[k]}
            onClick={() => onMethod(k)}
          />
        ))}
        <MoneyFilterChip active={false} label="Source: all ▾" onClick={() => undefined} />
      </div>

      <div data-money-desk-table>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Date", "Client and work", "Method", "State", "Amount"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 4 ? "right" : "left",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: COLORS.inkMuted,
                    padding: "8px 12px",
                    borderBottom: `1px solid ${COLORS.borderSoft}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const refund = refundForPayment(refunds, p);
              return (
                <tr
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(p);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <td
                    style={{
                      padding: "11px 12px",
                      borderBottom: `1px solid ${COLORS.borderSoft}`,
                      fontSize: 14,
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatSeptemberDay(p.day)}
                  </td>
                  <td style={{ padding: "11px 12px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.clientName}</div>
                    <div style={{ fontSize: 13.5, color: COLORS.inkMuted }}>{p.forLabel}</div>
                  </td>
                  <td
                    style={{
                      padding: "11px 12px",
                      borderBottom: `1px solid ${COLORS.borderSoft}`,
                      fontSize: 13.5,
                      color: COLORS.inkMuted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {methodLabel(p.method)}
                  </td>
                  <td style={{ padding: "11px 12px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                    <MoneyStateChip
                      label={
                        refund
                          ? `Received · ${formatMoneyShort(refund.amount)} refunded`
                          : "Received"
                      }
                      ok={!refund}
                    />
                  </td>
                  <td
                    style={{
                      padding: "11px 12px",
                      borderBottom: `1px solid ${COLORS.borderSoft}`,
                      textAlign: "right",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {formatMoneyMajor(p.amount)}
                    </div>
                    {refund ? (
                      <div
                        style={{
                          fontSize: 12.5,
                          color: COLORS.inkMuted,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        − {formatMoneyShort(refund.amount)} refund
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 13, color: COLORS.inkDim, padding: "12px 4px" }}>
          All {payments.length} payments shown · refunds are listed under the payment they belong to
        </div>
      </div>

      <div data-money-mob-list style={{ display: "none" }}>
        <MobilePaymentList payments={payments} refunds={refunds} onOpen={onOpen} />
      </div>
    </div>
  );
}

function MobilePaymentList({
  payments,
  refunds,
  onOpen,
}: {
  payments: MoneyPaymentRow[];
  refunds: ReturnType<typeof buildMoneySpineView>["refunds"];
  onOpen: (p: MoneyPaymentRow) => void;
}) {
  const byDay = new Map<number, MoneyPaymentRow[]>();
  for (const p of payments) {
    const list = byDay.get(p.day) ?? [];
    list.push(p);
    byDay.set(p.day, list);
  }
  const days = [...byDay.keys()].sort((a, b) => b - a);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {days.map((d) => (
        <div key={d}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.inkMuted,
              padding: "6px 2px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {formatSeptemberDay(d)}
          </div>
          <div
            style={{
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: RADIUS.lg,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {(byDay.get(d) ?? []).map((p, i) => {
              const refund = refundForPayment(refunds, p);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpen(p)}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    width: "100%",
                    padding: "13px 14px",
                    border: "none",
                    borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none",
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: FONTS.body,
                  }}
                >
                  <MoneyAvatar initials={initialsFromName(p.clientName)} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{p.clientName}</div>
                    <div
                      style={{
                        fontSize: 14,
                        color: COLORS.inkMuted,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.forLabel}
                    </div>
                    <div style={{ fontSize: 13.5, color: COLORS.inkDim }}>{methodLabel(p.method)}</div>
                    {refund ? (
                      <div style={{ fontSize: 13.5, color: COLORS.inkMuted, marginTop: 2 }}>
                        ↩ Refunded {formatMoneyShort(refund.amount)} on{" "}
                        {formatSeptemberDay(refund.day)}
                      </div>
                    ) : null}
                  </div>
                  <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formatMoneyMajor(p.amount)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

