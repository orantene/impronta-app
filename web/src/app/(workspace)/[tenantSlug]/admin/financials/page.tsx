// Workspace admin — Business Financials page.
//
// Server Component. Capability gate: `manage_billing` (owner-class).
// Reads from `loadAgencyFinancials`, which projects
// `booking_commission_snapshot` through the *agency* lens (the same rows
// `/talent/money` reads, projected through the talent lens). The two
// surfaces never merge — see decision-log L43 + the admin-financials
// addendum below.
//
// Sections:
//   1. P&L strip   (MTD + YTD)
//   2. Per-talent payouts table
//   3. Top clients by gross
//   4. Payment-status breakdown
//   5. Commission policy (read-only resolved rate)

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadAgencyFinancials, loadAgencyFinancialsByCurrency } from "@/lib/billing/agency-financials";
import { loadCommissionContext } from "../../_data-bridge";
import { AdminFinancialsCurrencyTabs } from "@/components/admin/applications/AdminFinancialsCurrencyTabs";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.10)",
  amber:      "#B45309",
  amberSoft:  "rgba(180,83,9,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-EU", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(cents / 100));
  } catch {
    // Unknown ISO code → fall back to bare amount + code suffix.
    return `${Math.round(cents / 100).toLocaleString()} ${currency}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(d);
  return `${month} ${d.getDate()}`;
}

function KpiTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: "neutral" | "green" | "amber";
}) {
  const accentColor = tone === "green" ? C.green : tone === "amber" ? C.amber : C.ink;
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accentColor,
          letterSpacing: -0.2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub != null && (
        <div style={{ fontSize: 11.5, color: C.inkMuted }}>{sub}</div>
      )}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: 0 }}>
        {title}
      </h2>
      {sub && <div style={{ fontSize: 12, color: C.inkMuted }}>{sub}</div>}
    </div>
  );
}

import type { AgencyFinancials } from "@/lib/billing/agency-financials-types";

// Payment-status tile labels. `paid` / `pending` / `confirmed` already exist
// in the shared enum catalog — reuse those rather than duplicating strings.
const PAYMENT_STATUS_LABEL_KEYS: Record<"paid" | "invoiced" | "pending" | "confirmed", string> = {
  paid: "dashboard.enums.transactionStatus.paid",
  invoiced: "dashboard.adminFinancials.statusInvoiced",
  pending: "dashboard.enums.transactionStatus.pending",
  confirmed: "dashboard.enums.inquiryStatus.confirmed",
};

function FinancialsBundle({ financials, t }: { financials: AgencyFinancials; t: Translate }) {
  const { totals, mtd, perTalent, topClients, byPaymentStatus } = financials;
  const eur = (cents: number) => money(cents, totals.currency);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>
      {/* ── P&L strip ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader
          title={t("dashboard.adminFinancials.pnlTitle")}
          sub={interpolate(t("dashboard.adminFinancials.pnlSub"), { currency: totals.currency })}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <KpiTile
            label={t("dashboard.adminFinancials.ytdGross")}
            value={eur(totals.ytdGrossCents)}
            sub={interpolate(
              t(
                totals.confirmedBookingsCount === 1
                  ? "dashboard.adminFinancials.confirmedBookings.one"
                  : "dashboard.adminFinancials.confirmedBookings.other",
              ),
              { count: totals.confirmedBookingsCount },
            )}
          />
          <KpiTile label={t("dashboard.adminFinancials.ytdCommission")} value={eur(totals.ytdWorkspaceFeeCents)} sub={t("dashboard.adminFinancials.ytdCommissionSub")} tone="green" />
          <KpiTile label={t("dashboard.adminFinancials.ytdTalentPayouts")} value={eur(totals.ytdTalentNetCents)} sub={t("dashboard.adminFinancials.ytdTalentPayoutsSub")} />
          <KpiTile label={t("dashboard.adminFinancials.ytdPlatformFee")} value={eur(totals.ytdPlatformFeeCents)} sub={t("dashboard.adminFinancials.ytdPlatformFeeSub")} />
          <KpiTile label={t("dashboard.adminFinancials.pendingPayout")} value={eur(totals.pendingPayoutCents)} sub={t("dashboard.adminFinancials.pendingPayoutSub")} tone={totals.pendingPayoutCents > 0 ? "amber" : "neutral"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <KpiTile label={t("dashboard.adminFinancials.mtdGross")} value={eur(mtd.grossCents)} sub={t("dashboard.adminFinancials.mtdGrossSub")} />
          <KpiTile label={t("dashboard.adminFinancials.mtdCommission")} value={eur(mtd.workspaceFeeCents)} tone="green" />
          <KpiTile label={t("dashboard.adminFinancials.mtdTalentPayouts")} value={eur(mtd.talentNetCents)} />
          <KpiTile label={t("dashboard.adminFinancials.mtdPlatformFee")} value={eur(mtd.platformFeeCents)} />
        </div>
      </section>

      {/* ── Per-talent payouts ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader title={t("dashboard.adminFinancials.perTalentTitle")} sub={t("dashboard.adminFinancials.perTalentSub")} />
        {perTalent.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.inkMuted, fontSize: 13 }}>
            {t("dashboard.adminFinancials.perTalentEmpty")}
          </div>
        ) : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surface, color: C.inkMuted, textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.6 }}>
                  <th style={{ textAlign: "left", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colTalent")}</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colBookings")}</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colGross")}</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colTalentNet")}</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colPending")}</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colLastBooking")}</th>
                </tr>
              </thead>
              <tbody>
                {perTalent.map((t) => (
                  <tr key={t.talentProfileId} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                    <td style={{ padding: "10px 14px", color: C.ink, fontWeight: 500 }}>{t.talentDisplayName}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.inkMuted }}>{t.bookingsCount}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(t.grossCents)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.green }}>{eur(t.talentNetCents)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: t.pendingPayoutCents > 0 ? C.amber : C.inkMuted }}>{eur(t.pendingPayoutCents)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.inkMuted }}>{formatDate(t.lastBookingAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Top clients ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader title={t("dashboard.adminFinancials.topClientsTitle")} sub={t("dashboard.adminFinancials.topClientsSub")} />
        {topClients.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.inkMuted, fontSize: 13 }}>
            {t("dashboard.adminFinancials.topClientsEmpty")}
          </div>
        ) : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surface, color: C.inkMuted, textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.6 }}>
                  <th style={{ textAlign: "left", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colClient")}</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colBookings")}</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colGross")}</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>{t("dashboard.adminFinancials.colLastBooking")}</th>
                </tr>
              </thead>
              <tbody>
                {topClients.map((row) => (
                  <tr key={row.clientLabel} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                    <td style={{ padding: "10px 14px", color: C.ink, fontWeight: 500 }}>{row.clientLabel}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.inkMuted }}>{row.bookingsCount}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(row.grossCents)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.inkMuted }}>{formatDate(row.lastBookingAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Payment status ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader title={t("dashboard.adminFinancials.paymentStatusTitle")} sub={t("dashboard.adminFinancials.paymentStatusSub")} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {(["paid", "invoiced", "pending", "confirmed"] as const).map((status) => (
            <KpiTile
              key={status}
              label={t(PAYMENT_STATUS_LABEL_KEYS[status])}
              value={`${byPaymentStatus[status].bookings}`}
              sub={interpolate(t("dashboard.adminFinancials.grossAmount"), {
                amount: eur(byPaymentStatus[status].grossCents),
              })}
              tone={status === "paid" ? "green" : status === "pending" ? "amber" : "neutral"}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function WorkspaceFinancialsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Capability gate — owner-class only. Non-billing roles get a 404, not
  // a blank-state page (matches existing transfer_ownership / suspend
  // gating elsewhere in the admin tree).
  const canManageBilling = await userHasCapability("manage_billing", scope.tenantId);
  if (!canManageBilling) notFound();

  const [byCurrency, legacyFinancials, commission] = await Promise.all([
    loadAgencyFinancialsByCurrency(scope.tenantId),
    loadAgencyFinancials(scope.tenantId), // used as the empty-state fallback when no rows exist at all
    loadCommissionContext(scope.tenantId),
  ]);
  const bundles = byCurrency.byCurrency.length > 0
    ? byCurrency.byCurrency
    : [legacyFinancials];
  const currencies = byCurrency.byCurrency.length > 0
    ? byCurrency.currencies
    : [legacyFinancials.totals.currency];

  const policyOriginLabel: Record<string, string> = {
    free: t("dashboard.adminFinancials.originFree"),
    studio: t("dashboard.adminFinancials.originStudio"),
    agency: t("dashboard.adminFinancials.originAgency"),
    network: t("dashboard.adminFinancials.originNetwork"),
  };

  const tabsChildren: Record<string, React.ReactNode> = {};
  for (const bundle of bundles) {
    tabsChildren[bundle.totals.currency] = <FinancialsBundle financials={bundle} t={t} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>
      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
            {scope.membership.display_name}
          </div>
          <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: 0, lineHeight: 1.1 }}>
            {t("dashboard.adminFinancials.pageTitle")}
          </h1>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.inkMuted }}>
            {t("dashboard.adminFinancials.pageIntroBefore")}{" "}
            <em>{t("dashboard.adminFinancials.pageIntroMoneyView")}</em>{" "}
            {t("dashboard.adminFinancials.pageIntroAfter")}
          </div>
        </div>
        <Link
          href={`/${tenantSlug}/admin/bookings`}
          style={{ fontSize: 12.5, color: C.accent, textDecoration: "underline" }}
        >
          {t("dashboard.adminFinancials.viewBookings")}
        </Link>
      </div>

      {/* ── Per-currency bundles (tabs when >1 currency present) ── */}
      <AdminFinancialsCurrencyTabs
        currencies={currencies}
        defaultCurrency={byCurrency.defaultCurrency}
      >
        {tabsChildren}
      </AdminFinancialsCurrencyTabs>

      {/* ── Commission policy ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader title={t("dashboard.adminFinancials.commissionPolicyTitle")} sub={t("dashboard.adminFinancials.commissionPolicySub")} />
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim }}>{t("dashboard.adminFinancials.planTier")}</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.ink, textTransform: "capitalize" }}>{commission.planTier}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim }}>{t("dashboard.adminFinancials.platformFee")}</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                {commission.feePercent} ({commission.feeBasisPoints} bps)
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim }}>{t("dashboard.adminFinancials.origin")}</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.ink }}>
                {policyOriginLabel[commission.planTier] ?? t("dashboard.adminFinancials.originDefault")}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted }}>
            {t("dashboard.adminFinancials.commissionPolicyNote")}
          </div>
        </div>
      </section>
    </div>
  );
}
