// Phase 3.11 — Platform HQ · Billing
// MRR by plan, invoice ledger, dunning queue.
// Real billing data is Phase 8 work. Plan distribution wired from agencies table.

import Link from "next/link";
import {
  loadPlatformPlanDistribution,
  loadPlatformStats,
} from "../../platform-data";
import {
  loadPlatformBookingRevenue,
  type PlatformRevenueByCurrency,
} from "@/lib/billing/platform-revenue";
import { listHeldPayouts } from "@/lib/payments/booking-payouts-ledger";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { HeldPayoutsSection } from "./HeldPayoutsSection";

function fmtMoney(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  });
}

export const dynamic = "force-dynamic";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function StatCard({
  label,
  value,
  caption,
  tone = "ink",
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  tone?: "ink" | "green" | "amber" | "red" | "dim";
}) {
  const accent =
    tone === "green"
      ? HQ.green
      : tone === "amber"
      ? HQ.amber
      : tone === "red"
      ? HQ.red
      : tone === "dim"
      ? HQ.inkDim
      : HQ.ink;

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 120,
      }}
    >
      <span style={{ fontFamily: F, fontSize: 11.5, color: HQ.inkMuted, fontWeight: 500 }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: FD,
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: -0.6,
          color: accent,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontFamily: F, fontSize: 11.5, color: HQ.inkMuted }}>
          {caption}
        </span>
      )}
    </div>
  );
}

function HqCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
      }}
    >
      <div className="mb-2.5">
        <span
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: HQ.inkMuted }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// Plan price (cents) for MRR estimate. Source: lib/access/plan-catalog.ts.
const PLAN_PRICE_CENTS: Record<string, number> = {
  free:    0,
  studio:  4900,
  agency:  14900,
  network: 29900,
};

const PLAN_PALETTE: Record<string, string> = {
  free:    "rgba(245,242,235,0.38)",
  studio:  HQ.amber,
  agency:  HQ.green,
  network: "#A07AE0",
};

export default async function PlatformBillingPage() {
  const [planDist, stats, revenue, heldPayouts, locale] = await Promise.all([
    loadPlatformPlanDistribution(),
    loadPlatformStats(),
    loadPlatformBookingRevenue(),
    listHeldPayouts(),
    getRequestLocale(),
  ]);
  const t = createTranslator(locale);

  // Primary currency = the one with the most platform-fee revenue.
  const primary: PlatformRevenueByCurrency | null = revenue.byCurrency[0] ?? null;

  const totalActiveTenants = planDist.reduce((sum, r) => sum + r.activeCount, 0);
  const paidTenants = planDist
    .filter((r) => r.plan !== "free")
    .reduce((sum, r) => sum + r.activeCount, 0);
  const estimatedMrrCents = planDist.reduce(
    (sum, r) => sum + (PLAN_PRICE_CENTS[r.plan] ?? 0) * r.activeCount,
    0,
  );
  const estimatedMrr = (estimatedMrrCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <h1
          style={{
            fontFamily: FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
          }}
        >
          {t("dashboard.platform.billing.title")}
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {t("dashboard.platform.billing.subtitle")}
        </p>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/platform/admin/billing/discount-codes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 8,
              background: "rgba(93,211,160,0.12)",
              border: "1px solid rgba(93,211,160,0.28)",
              color: HQ.green,
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: F,
              textDecoration: "none",
            }}
          >
            {t("dashboard.platform.billing.discountCodesLink")}
          </Link>
          <Link
            href="/platform/admin/billing/commission"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 8,
              background: "rgba(155,168,183,0.12)",
              border: "1px solid rgba(155,168,183,0.28)",
              color: HQ.amber,
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: F,
              textDecoration: "none",
            }}
          >
            {t("dashboard.platform.billing.commissionLink")}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label={t("dashboard.platform.billing.stat.estimatedMrr")}
          value={estimatedMrr}
          caption={t("dashboard.platform.billing.stat.estimatedMrrCaption")}
          tone={estimatedMrrCents > 0 ? "green" : "dim"}
        />
        <StatCard
          label={t("dashboard.platform.billing.stat.paidTenants")}
          value={paidTenants}
          caption={interpolate(
            t("dashboard.platform.billing.stat.paidTenantsCaption"),
            { total: totalActiveTenants },
          )}
          tone={paidTenants > 0 ? "ink" : "dim"}
        />
        <StatCard
          label={t("dashboard.platform.billing.stat.churn")}
          value="—"
          caption={t("dashboard.platform.billing.stat.churnCaption")}
          tone="dim"
        />
        <StatCard
          label={t("dashboard.platform.billing.stat.failedPayments")}
          value="0"
          caption={t("dashboard.platform.billing.stat.failedPaymentsCaption")}
          tone="green"
        />
      </div>

      {/* Plan breakdown — real data */}
      <HqCard
        title={t("dashboard.platform.billing.planDistribution.title")}
        subtitle={interpolate(
          t("dashboard.platform.billing.planDistribution.subtitle"),
          { total: stats.totalTenants, active: totalActiveTenants },
        )}
      >
        {planDist.map((row) => {
          const color = PLAN_PALETTE[row.plan] ?? "rgba(245,242,235,0.38)";
          const monthlyCents = (PLAN_PRICE_CENTS[row.plan] ?? 0) * row.activeCount;
          const monthly = (monthlyCents / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          });
          const ratio =
            totalActiveTenants > 0
              ? Math.round((row.activeCount / totalActiveTenants) * 100)
              : 0;
          return (
            <div
              key={row.plan}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderTop: `1px solid ${HQ.borderSoft}`,
                fontFamily: F,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: HQ.ink,
                  textTransform: "capitalize" as const,
                }}
              >
                {row.plan}
              </span>
              {/* Bar */}
              <span
                style={{
                  width: 80,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.04)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: `${ratio}%`,
                    height: "100%",
                    background: color,
                  }}
                />
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: HQ.inkMuted,
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 56,
                  textAlign: "right",
                }}
              >
                {row.activeCount}
                {row.tenantCount !== row.activeCount && (
                  <span style={{ color: HQ.inkDim }}> / {row.tenantCount}</span>
                )}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: row.plan === "free" ? HQ.inkDim : HQ.inkMuted,
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 80,
                  textAlign: "right",
                }}
              >
                {row.plan === "free" ? "—" : `${monthly}/mo`}
              </span>
            </div>
          );
        })}
      </HqCard>

      <div style={{ height: 12 }} />

      {/* Booking revenue — real money from the commission engine */}
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
                    ? t(
                        "dashboard.platform.billing.bookingRevenue.truncatedSuffix",
                      )
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
            {/* Headline stat row for the primary currency */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
                marginBottom: primary ? 14 : 0,
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
                label={t(
                  "dashboard.platform.billing.bookingRevenue.grossProcessed",
                )}
                value={fmtMoney(primary.grossChargedCents, primary.currency)}
                caption={t(
                  "dashboard.platform.billing.bookingRevenue.grossProcessedCaption",
                )}
              />
              <StatCard
                label={t(
                  "dashboard.platform.billing.bookingRevenue.paidToTalent",
                )}
                value={fmtMoney(primary.talentNetCents, primary.currency)}
                caption={t(
                  "dashboard.platform.billing.bookingRevenue.paidToTalentCaption",
                )}
              />
              <StatCard
                label={t(
                  "dashboard.platform.billing.bookingRevenue.workspaceMargins",
                )}
                value={fmtMoney(primary.workspaceFeeCents, primary.currency)}
                caption={t(
                  "dashboard.platform.billing.bookingRevenue.workspaceMarginsCaption",
                )}
              />
            </div>

            {/* Per-currency breakdown (incl. non-primary currencies + refunds) */}
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
                  gridTemplateColumns: "0.7fr 1fr 1fr 1fr 1fr",
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
                    gridTemplateColumns: "0.7fr 1fr 1fr 1fr 1fr",
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
                      {" "}· {row.bookings}
                    </span>
                  </span>
                  <span style={{ fontSize: 12.5, color: HQ.green, textAlign: "right" }}>
                    {fmtMoney(row.platformFeeCents, row.currency)}
                    {row.refundedPlatformFeeCents > 0 && (
                      <span style={{ color: HQ.red, fontSize: 10.5 }}>
                        {" "}−{fmtMoney(row.refundedPlatformFeeCents, row.currency)}
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
            <p style={{ fontSize: 11, color: HQ.inkDim, margin: "10px 0 0", fontFamily: F }}>
              {t("dashboard.platform.billing.bookingRevenue.footnote")}
            </p>
          </>
        )}
      </HqCard>

      <HeldPayoutsSection rows={heldPayouts} />
    </>
  );
}
