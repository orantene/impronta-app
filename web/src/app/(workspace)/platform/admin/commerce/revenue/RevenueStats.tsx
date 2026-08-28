/**
 * RevenueStats — the headline numbers on the Revenue tab, and the card chrome
 * the rest of the tab reuses.
 *
 * These four stat cards are the reason this phase exists. On the old Billing
 * page three of them were fiction:
 *
 *   • "Estimated MRR" was a hardcoded price map times a count of TENANT ROWS,
 *     so every comped tenant read as revenue and the Network tier was billed at
 *     an invented $299 the catalog has never held. It now comes from
 *     `platform-mrr.ts`, which reads subscriptions — comps have none.
 *   • "Failed payments" was the literal string "0", printed green, with no read
 *     of any status column. It is now the count of `past_due` subscriptions.
 *   • "Churn (30d)" was the literal "—" captioned "Stripe integration pending".
 *     It is now "Cancellations (30d)", a real count of `cancelled_at` inside
 *     the window. A count, deliberately, not a rate: a rate needs a denominator
 *     the platform has not agreed on, and inventing one would repeat the
 *     mistake this pass is undoing.
 *
 * The i18n KEY NAMES are unchanged on purpose — only their values moved. The
 * dead-key ratchet fails CI when a key loses its last reader, so relabelling in
 * place is both cheaper and less risky than minting a parallel key set.
 */

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { PlatformMrrSnapshot } from "@/lib/billing/platform-mrr";
import type { SubscriptionAttentionCounts } from "../../../platform-data";
import { HQ, F, FD } from "../_tokens";

export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function fmtMoney(cents: number, currency: string): string {
  const code = (currency || "usd").toUpperCase();
  try {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${(cents / 100).toFixed(0)} ${code}`;
  }
}

export function StatCard({
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
        <span style={{ fontFamily: F, fontSize: 11.5, color: HQ.inkMuted, lineHeight: 1.45 }}>
          {caption}
        </span>
      )}
    </div>
  );
}

export function HqCard({
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

const PLAN_PALETTE: Record<string, string> = {
  free: "rgba(245,242,235,0.38)",
  website: "#9EB6E5",
  studio: "#E8B864",
  agency: HQ.green,
  network: "#A07AE0",
};

export function RevenueStatGrid({
  t,
  mrr,
  attention,
}: {
  t: Translator;
  mrr: PlatformMrrSnapshot;
  attention: SubscriptionAttentionCounts;
}) {
  const compedTotal = mrr.compedWorkspaceCount + mrr.compedTalentCount;

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <StatCard
          label={t("dashboard.platform.billing.stat.estimatedMrr")}
          value={usd(mrr.mrrCents)}
          caption={t("dashboard.platform.billing.stat.estimatedMrrCaption")}
          tone={mrr.mrrCents > 0 ? "green" : "dim"}
        />
        <StatCard
          label={t("dashboard.platform.billing.stat.paidTenants")}
          value={mrr.payingCount}
          caption={interpolate(
            t("dashboard.platform.billing.stat.paidTenantsCaption"),
            { total: compedTotal },
          )}
          tone={mrr.payingCount > 0 ? "ink" : "dim"}
        />
        <StatCard
          label={t("dashboard.platform.billing.stat.churn")}
          value={mrr.churn.cancellationCount}
          caption={t("dashboard.platform.billing.stat.churnCaption")}
          tone={mrr.churn.cancellationCount > 0 ? "amber" : "dim"}
        />
        <StatCard
          label={t("dashboard.platform.billing.stat.failedPayments")}
          value={mrr.pastDueCount}
          caption={t("dashboard.platform.billing.stat.failedPaymentsCaption")}
          tone={mrr.pastDueCount > 0 ? "red" : "green"}
        />
      </div>

      {/* The footnote row: everything the headline number deliberately leaves
          out, so the gap between "tenants on a paid tier" and "tenants paying"
          is explainable instead of suspicious. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          rowGap: 6,
          marginBottom: 24,
          fontFamily: F,
          fontSize: 11.5,
          color: HQ.inkMuted,
          lineHeight: 1.6,
        }}
      >
        <span>
          {interpolate(t("dashboard.platform.commerce.revenue.notes.comped"), {
            count: compedTotal,
          })}
        </span>
        <span>
          {interpolate(t("dashboard.platform.commerce.revenue.notes.trialing"), {
            count: mrr.trialingCount,
          })}
        </span>
        {mrr.discountCents > 0 && (
          <span>
            {interpolate(t("dashboard.platform.commerce.revenue.notes.discounted"), {
              amount: usd(mrr.discountCents),
              gross: usd(mrr.grossMrrCents),
            })}
          </span>
        )}
        {mrr.unpricedCount > 0 && (
          <span style={{ color: HQ.amber }}>
            {interpolate(t("dashboard.platform.commerce.revenue.notes.unpriced"), {
              count: mrr.unpricedCount,
            })}
          </span>
        )}
        {attention.cancelingAtPeriodEnd > 0 && (
          <span style={{ color: HQ.amber }}>
            {interpolate(t("dashboard.platform.commerce.revenue.notes.canceling"), {
              count: attention.cancelingAtPeriodEnd,
            })}
          </span>
        )}
        {attention.trialEndingSoon > 0 && (
          <span>
            {interpolate(t("dashboard.platform.commerce.revenue.notes.trialEndingSoon"), {
              count: attention.trialEndingSoon,
            })}
          </span>
        )}
        {mrr.degraded && (
          <span style={{ color: HQ.red }}>
            {t("dashboard.platform.commerce.revenue.notes.degraded")}
          </span>
        )}
      </div>
    </>
  );
}

export type PlanDistributionRow = {
  plan: string;
  tenantCount: number;
  activeCount: number;
};

/**
 * Plan distribution is an ENTITLEMENT breakdown, not a revenue one — it counts
 * `agencies.plan_tier`, the column a comp override writes to. The old page
 * multiplied it by a price and printed the result as money, which is precisely
 * how comps became revenue. The money column is gone; the share bar stays,
 * captioned for what it actually is.
 */
export function PlanDistribution({
  t,
  rows,
  totalActive,
}: {
  t: Translator;
  rows: readonly PlanDistributionRow[];
  totalActive: number;
}) {
  return (
    <>
      {rows.map((row) => {
        const color = PLAN_PALETTE[row.plan] ?? "rgba(245,242,235,0.38)";
        const ratio =
          totalActive > 0 ? Math.round((row.activeCount / totalActive) * 100) : 0;
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
                color: HQ.inkDim,
                fontVariantNumeric: "tabular-nums",
                minWidth: 44,
                textAlign: "right",
              }}
            >
              {ratio}%
            </span>
          </div>
        );
      })}
      <p style={{ margin: "10px 0 0", fontSize: 11, color: HQ.inkDim, fontFamily: F }}>
        {t("dashboard.platform.commerce.revenue.planDistributionNote")}
      </p>
    </>
  );
}
