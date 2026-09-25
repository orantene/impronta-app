"use client";

import { COLORS, FONTS, RADIUS } from "@/components/admin/shell/internal/state";
import type { MoneyPayoutRow } from "@/lib/money/money-read-model";
import {
  formatMoneyMajor,
  formatSeptemberDay,
  payoutIncludesLabel,
} from "@/lib/money/money-spine-view";
import { MoneyStateChip } from "./money-spine-shared";

export function MoneyPayoutsPanel({
  payouts,
  currency,
}: {
  payouts: readonly MoneyPayoutRow[];
  currency: string;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13.5, color: COLORS.inkMuted, lineHeight: 1.5, margin: "0 0 12px" }}>
        Only card payments made through Tulala become payouts. Cash and transfers you record went
        straight to you. Each Friday payout carries the card payments made Thursday to Wednesday
        before it, less refunds and processor fees.{" "}
        <span style={{ color: COLORS.indigoDeep, fontWeight: 600 }}>View breakdown</span>
      </p>

      <div data-money-desk-po>
        {payouts.map((po) => (
          <div
            key={po.id}
            style={{
              display: "grid",
              gridTemplateColumns: "150px 170px 1fr 1.2fr 140px",
              gap: 14,
              alignItems: "center",
              padding: "14px 12px",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            <span style={{ fontSize: 14.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatSeptemberDay(po.day)}
            </span>
            <span>
              <MoneyStateChip
                label={
                  po.state === "paid"
                    ? "Paid"
                    : po.estimated
                      ? "Scheduled · estimated"
                      : "Scheduled"
                }
                ok={po.state === "paid"}
                info={po.state !== "paid"}
              />
            </span>
            <span style={{ fontSize: 13.5, color: COLORS.inkMuted }}>BBVA ···4471</span>
            <span style={{ fontSize: 13.5, color: COLORS.inkMuted }}>
              {payoutIncludesLabel(po)}
              {po.estimated ? (
                <>
                  <br />
                  <span style={{ color: COLORS.inkDim }}>
                    Payments through Wed 23 still settling
                  </span>
                </>
              ) : null}
            </span>
            <span
              style={{
                textAlign: "right",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatMoneyMajor(po.net, currency)}
            </span>
          </div>
        ))}
      </div>

      <div data-money-mob-po style={{ display: "none", flexDirection: "column", gap: 10 }}>
        {payouts.map((po) => (
          <div
            key={po.id}
            style={{
              padding: 14,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: RADIUS.lg,
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
                {formatSeptemberDay(po.day)}
              </span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {formatMoneyMajor(po.net, currency)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <MoneyStateChip
                label={po.state === "paid" ? "Paid" : "Scheduled · estimated"}
                ok={po.state === "paid"}
                info={po.state !== "paid"}
              />
              <span style={{ fontSize: 13.5, color: COLORS.inkMuted }}>BBVA ···4471</span>
            </div>
            <div style={{ fontSize: 13.5, color: COLORS.inkDim, marginTop: 4 }}>
              {payoutIncludesLabel(po)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

