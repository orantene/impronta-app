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

function FinancialsBundle({ financials }: { financials: AgencyFinancials }) {
  const { totals, mtd, perTalent, topClients, byPaymentStatus } = financials;
  const eur = (cents: number) => money(cents, totals.currency);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>
      {/* ── P&L strip ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader title="P&L" sub={`Calendar year-to-date and current month — ${totals.currency} bookings only.`} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <KpiTile label="YTD gross revenue" value={eur(totals.ytdGrossCents)} sub={`${totals.confirmedBookingsCount} confirmed booking${totals.confirmedBookingsCount === 1 ? "" : "s"}`} />
          <KpiTile label="YTD agency commission" value={eur(totals.ytdWorkspaceFeeCents)} sub="Workspace lane (your earnings)" tone="green" />
          <KpiTile label="YTD talent payouts" value={eur(totals.ytdTalentNetCents)} sub="What talent earned" />
          <KpiTile label="YTD platform fee" value={eur(totals.ytdPlatformFeeCents)} sub="Paid to Tulala" />
          <KpiTile label="Pending payout (workspace lane)" value={eur(totals.pendingPayoutCents)} sub="Owed but not yet marked paid" tone={totals.pendingPayoutCents > 0 ? "amber" : "neutral"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <KpiTile label="MTD gross" value={eur(mtd.grossCents)} sub="This calendar month" />
          <KpiTile label="MTD commission" value={eur(mtd.workspaceFeeCents)} tone="green" />
          <KpiTile label="MTD talent payouts" value={eur(mtd.talentNetCents)} />
          <KpiTile label="MTD platform fee" value={eur(mtd.platformFeeCents)} />
        </div>
      </section>

      {/* ── Per-talent payouts ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader title="Per-talent payouts" sub="What this agency owes / has paid each rostered talent, year-to-date." />
        {perTalent.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.inkMuted, fontSize: 13 }}>
            No commission snapshots yet for this currency.
          </div>
        ) : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surface, color: C.inkMuted, textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.6 }}>
                  <th style={{ textAlign: "left", padding: "10px 14px" }}>Talent</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Bookings</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Gross</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Talent net</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Pending</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Last booking</th>
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
        <SectionHeader title="Top clients by gross" sub="Largest revenue contributors year-to-date." />
        {topClients.length === 0 ? (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.inkMuted, fontSize: 13 }}>
            No client revenue yet for this currency.
          </div>
        ) : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.surface, color: C.inkMuted, textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.6 }}>
                  <th style={{ textAlign: "left", padding: "10px 14px" }}>Client</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Bookings</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Gross</th>
                  <th style={{ textAlign: "right", padding: "10px 14px" }}>Last booking</th>
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
        <SectionHeader title="Payment status" sub="Counts and gross for each lifecycle state." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {(["paid", "invoiced", "pending", "confirmed"] as const).map((status) => (
            <KpiTile
              key={status}
              label={status[0]!.toUpperCase() + status.slice(1)}
              value={`${byPaymentStatus[status].bookings}`}
              sub={`${eur(byPaymentStatus[status].grossCents)} gross`}
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
    free: "Free tier default",
    studio: "Studio tier default",
    agency: "Agency tier default",
    network: "Network tier default",
  };

  const tabsChildren: Record<string, React.ReactNode> = {};
  for (const bundle of bundles) {
    tabsChildren[bundle.totals.currency] = <FinancialsBundle financials={bundle} />;
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
            Business financials
          </h1>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.inkMuted }}>
            Revenue, agency commission earned, talent payouts owed. Reads the
            same snapshot rows as the talent <em>Money</em> view — projected
            through the agency lens.
          </div>
        </div>
        <Link
          href={`/${tenantSlug}/admin/bookings`}
          style={{ fontSize: 12.5, color: C.accent, textDecoration: "underline" }}
        >
          View bookings →
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
        <SectionHeader title="Commission policy" sub="Read-only view of the rate this workspace is currently resolved to. Per-tenant overrides are set by platform admin." />
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim }}>Plan tier</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.ink, textTransform: "capitalize" }}>{commission.planTier}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim }}>Platform fee</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                {commission.feePercent} ({commission.feeBasisPoints} bps)
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.inkDim }}>Origin</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.ink }}>
                {policyOriginLabel[commission.planTier] ?? "Plan default"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted }}>
            To request a different rate, contact platform admin. Per-tenant
            self-serve commission UI is on the roadmap and tracked separately
            from this surface.
          </div>
        </div>
      </section>
    </div>
  );
}
