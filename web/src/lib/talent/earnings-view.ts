import type { TalentAgencyRow } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import type { EarningsRow } from "@/components/admin/shell/internal/state/types";
import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";

export type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";

/**
 * Currency-aware money formatter for every talent earnings surface.
 *
 * Renders `cents` in the booking's ACTUAL currency (`currencyCode`, an
 * ISO-4217 code from the commission snapshot — e.g. MXN, ARS, USD, GBP, EUR),
 * NOT a hardcoded euro. `Intl.NumberFormat` picks the right symbol/code per
 * currency: MXN → "MX$800", USD → "$800", EUR → "€800", GBP → "£800",
 * ARS → "ARS 800". This is what keeps a MXN booking from being mislabeled €
 * (or, paired with the no-EUR-filter loader, dropped to 0) on the dashboard.
 *
 * Falls back to USD when the code is missing/blank (USD-first: the platform
 * operates in USD) and degrades to a plain "<CODE> <amount>" string if `Intl`
 * rejects an unknown code, so a bad code never throws in render.
 */
export function formatMoneyCents(cents: number, currencyCode?: string | null): string {
  const code = (currencyCode || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${code} ${Math.round(cents / 100).toLocaleString("en-US")}`;
  }
}

/**
 * @deprecated Hardcodes EUR. Kept only for non-talent-money call sites that
 * are genuinely euro. New talent earnings UI must use {@link formatMoneyCents}
 * with the bundle's `totals.currency` so MXN/ARS/USD render correctly.
 */
export function formatEurCents(cents: number): string {
  return formatMoneyCents(cents, "EUR");
}

function parseAmountCents(amount: string): number {
  const num = parseFloat(amount.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

function mapFixtureSource(
  kind: EarningsRow["source"]["kind"],
): TalentEarningsRow["source"] {
  if (kind === "agency") return "agency_routed";
  if (kind === "personal") return "personal_page";
  if (kind === "hub") return "hub";
  return "unknown";
}

function mapFixtureStatus(status: EarningsRow["status"]): TalentEarningsRow["status"] {
  if (status === "invoiced") return "invoiced";
  if (status === "pending") return "pending";
  return "paid";
}

/** Prototype fallback when the layout did not load live earnings (Phase D). */
export function mockTalentEarningsFromFixtures(
  rows: EarningsRow[],
  agencies: TalentAgencyRow[] | null,
): TalentEarnings {
  const mappedRows: TalentEarningsRow[] = rows.map((row) => {
    const cents = parseAmountCents(row.amount);
    return {
      id: row.id,
      workDate: row.workDate,
      payoutDate: row.payoutDate,
      agencyName: row.agency,
      client: row.client,
      grossCents: cents,
      netCents: cents,
      status: mapFixtureStatus(row.status),
      source: mapFixtureSource(row.source.kind),
      paymentMethod: row.paymentMethod,
    };
  });

  const ytdNetCents = mappedRows.reduce((sum, row) => sum + row.netCents, 0);
  const pendingCents = mappedRows
    .filter((row) => row.status === "invoiced" || row.status === "pending")
    .reduce((sum, row) => sum + row.netCents, 0);
  const confirmedPipelineCents = mappedRows
    .filter((row) => row.status === "confirmed")
    .reduce((sum, row) => sum + row.netCents, 0);

  const perAgency = (agencies ?? []).map((agency) => {
    const agencyRows = mappedRows.filter(
      (row) =>
        row.source === "agency_routed" &&
        row.agencyName.toLowerCase().includes(agency.agencyName.toLowerCase()),
    );
    const ytdNet = agencyRows.reduce((sum, row) => sum + row.netCents, 0);
    return {
      tenantId: agency.id,
      slug: agency.agencySlug,
      name: agency.agencyName,
      ytdNetCents: ytdNet,
      bookingsCount: agencyRows.length,
      lastBookingAt: agencyRows[0]?.workDate ?? null,
      commissionBps: 0,
      rosterStatus: agency.rosterStatus,
      plan: agency.plan,
      isPrimary: agency.isPrimary,
    };
  });

  return {
    totals: {
      ytdGrossCents: ytdNetCents,
      ytdNetCents,
      pendingCents,
      confirmedPipelineCents,
      currency: "USD",
    },
    perAgency,
    rows: mappedRows,
  };
}
