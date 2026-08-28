/**
 * RevenueView — the Revenue tab of /platform/admin/commerce.
 *
 * Everything the old Billing page showed, minus the parts that were invented.
 * Four sections, in the order the money actually flows:
 *
 *   1. Honest subscription stats (MRR, paying, cancellations, past due).
 *   2. Plan distribution — an entitlement breakdown, no longer priced.
 *   3. Booking revenue from the commission engine — this was already real.
 *   4. Held payouts, INLINE, because it is an ops table you scan and retry.
 *      Putting it behind a drawer would hide the one thing it is for.
 *
 * Data arrives as props from `tab-body.tsx`; this component only lays out.
 */

import type {
  PlatformRevenueByCurrency,
  PlatformRevenueSummary,
} from "@/lib/billing/platform-revenue";
import type { PlatformMrrSnapshot } from "@/lib/billing/platform-mrr";
import type { HeldLedgerRow } from "@/lib/payments/booking-payouts-ledger";
import type {
  PlatformStats,
  SubscriptionAttentionCounts,
} from "../../../platform-data";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F } from "../_tokens";
import { HeldPayoutsSection } from "./HeldPayoutsSection";
import {
  HqCard,
  PlanDistribution,
  RevenueStatGrid,
  StatCard,
  fmtMoney,
  type PlanDistributionRow,
} from "./RevenueStats";

export async function RevenueView({
  planDist,
  stats,
  mrr,
  attention,
  revenue,
  heldPayouts,
}: {
  planDist: PlanDistributionRow[];
  stats: PlatformStats;
  mrr: PlatformMrrSnapshot;
  attention: SubscriptionAttentionCounts;
  revenue: PlatformRevenueSummary;
  heldPayouts: HeldLedgerRow[];
}) {
  const t = createTranslator(await getRequestLocale());

  // Primary currency = the one with the most platform-fee revenue.
  const primary: PlatformRevenueByCurrency | null = revenue.byCurrency[0] ?? null;
  const totalActiveTenants = planDist.reduce((sum, r) => sum + r.activeCount, 0);

  return (
    <>
      <RevenueStatGrid t={t} mrr={mrr} attention={attention} />

      <HqCard
        title={t("dashboard.platform.billing.planDistribution.title")}
        subtitle={interpolate(
          t("dashboard.platform.billing.planDistribution.subtitle"),
          { total: stats.totalTenants, active: totalActiveTenants },
        )}
      >
        <PlanDistribution t={t} rows={planDist} totalActive={totalActiveTenants} />
      </HqCard>

      <div style={{ height: 12 }} />

      {/* Booking revenue — real money from the commission engine. Unchanged
          from the Billing page: this half was never the dishonest half. */}
      <HqCard
        title={t("dashboard.platform.billing.bookingRevenue.title")}
        subtitle={
          revenue.hasData
            ? interpolate(
                t("dashboard.platform.billing.bookingRevenue.subtitleData"),
                {
                  count: revenue.totalBookings,
                  bookings: t(
                    revenue.totalBookings === 1
                      ? "dashboard.platform.billing.bookingRevenue.bookingOne"
                      : "dashboard.platform.billing.bookingRevenue.bookingMany",
                  ),
                  refunded:
                    revenue.totalRefundedBookings > 0
                      ? interpolate(
                          t(
                            "dashboard.platform.billing.bookingRevenue.refundedSuffix",
                          ),
                          { count: revenue.totalRefundedBookings },
                        )
                      : "",
                  truncated: revenue.truncated
                    ? t("dashboard.platform.billing.bookingRevenue.truncatedSuffix")
                    : "",
                },
              )
            : t("dashboard.platform.billing.bookingRevenue.subtitleEmpty")
        }
      >
        {!revenue.hasData || !primary ? (
          <div
            style={{
              padding: "28px 0",
              textAlign: "center",
              color: HQ.inkMuted,
              fontSize: 13,
              fontFamily: F,
            }}
          >
            {t("dashboard.platform.billing.bookingRevenue.empty")}
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <StatCard
                label={interpolate(
                  t("dashboard.platform.billing.bookingRevenue.platformFees"),
                  { currency: primary.currency.toUpperCase() },
                )}
                value={fmtMoney(primary.platformFeeCents, primary.currency)}
                caption={t(
                  "dashboard.platform.billing.bookingRevenue.platformFeesCaption",
                )}
                tone="green"
              />
              <StatCard
                label={t("dashboard.platform.billing.bookingRevenue.grossProcessed")}
                value={fmtMoney(primary.grossChargedCents, primary.currency)}
                caption={t(
                  "dashboard.platform.billing.bookingRevenue.grossProcessedCaption",
                )}
              />
              <StatCard
                label={t("dashboard.platform.billing.bookingRevenue.paidToTalent")}
                value={fmtMoney(primary.talentNetCents, primary.currency)}
                caption={t(
                  "dashboard.platform.billing.bookingRevenue.paidToTalentCaption",
                )}
              />
              <StatCard
                label={t("dashboard.platform.billing.bookingRevenue.workspaceMargins")}
                value={fmtMoney(primary.workspaceFeeCents, primary.currency)}
                caption={t(
                  "dashboard.platform.billing.bookingRevenue.workspaceMarginsCaption",
                )}
              />
            </div>

            <CurrencyTable revenue={revenue} t={t} />
            <p
              style={{
                fontSize: 11,
                color: HQ.inkDim,
                margin: "10px 0 0",
                fontFamily: F,
              }}
            >
              {t("dashboard.platform.billing.bookingRevenue.footnote")}
            </p>
          </>
        )}
      </HqCard>

      <HeldPayoutsSection rows={heldPayouts} />
    </>
  );
}

const GRID = "0.7fr 1fr 1fr 1fr 1fr";

function CurrencyTable({
  revenue,
  t,
}: {
  revenue: PlatformRevenueSummary;
  t: (key: string) => string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        overflow: "hidden",
        marginTop: 6,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          gap: 0,
          padding: "8px 14px",
          background: HQ.cardSoft,
          borderBottom: `1px solid ${HQ.borderSoft}`,
        }}
      >
        {[
          t("dashboard.platform.billing.bookingRevenue.colCurrency"),
          t("dashboard.platform.billing.bookingRevenue.colPlatformFee"),
          t("dashboard.platform.billing.bookingRevenue.colGross"),
          t("dashboard.platform.billing.bookingRevenue.colTalent"),
          t("dashboard.platform.billing.bookingRevenue.colWorkspace"),
        ].map((h, i) => (
          <span
            key={h}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: HQ.inkDim,
              letterSpacing: 0.4,
              textAlign: i === 0 ? "left" : "right",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {h}
          </span>
        ))}
      </div>
      {revenue.byCurrency.map((row, idx) => (
        <div
          key={row.currency}
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            gap: 0,
            padding: "10px 14px",
            borderTop: idx === 0 ? "none" : `1px solid ${HQ.borderSoft}`,
            alignItems: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ fontSize: 13, color: HQ.ink, fontWeight: 600 }}>
            {row.currency.toUpperCase()}
            <span style={{ color: HQ.inkDim, fontWeight: 400, fontSize: 11 }}>
              {" "}
              · {row.bookings}
            </span>
          </span>
          <span style={{ fontSize: 12.5, color: HQ.green, textAlign: "right" }}>
            {fmtMoney(row.platformFeeCents, row.currency)}
            {row.refundedPlatformFeeCents > 0 && (
              <span style={{ color: HQ.red, fontSize: 10.5 }}>
                {" "}
                −{fmtMoney(row.refundedPlatformFeeCents, row.currency)}
              </span>
            )}
          </span>
          <span style={{ fontSize: 12.5, color: HQ.inkMuted, textAlign: "right" }}>
            {fmtMoney(row.grossChargedCents, row.currency)}
          </span>
          <span style={{ fontSize: 12.5, color: HQ.inkMuted, textAlign: "right" }}>
            {fmtMoney(row.talentNetCents, row.currency)}
          </span>
          <span style={{ fontSize: 12.5, color: HQ.inkMuted, textAlign: "right" }}>
            {fmtMoney(row.workspaceFeeCents, row.currency)}
          </span>
        </div>
      ))}
    </div>
  );
}
