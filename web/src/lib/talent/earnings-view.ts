import type { TalentAgencyRow } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import type { EarningsRow } from "@/components/admin/shell/internal/state/types";
import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";

export type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";

export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
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
      currency: "EUR",
    },
    perAgency,
    rows: mappedRows,
  };
}
