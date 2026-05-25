export type TalentEarningsRow = {
  id: string;
  workDate: string;
  payoutDate: string | null;
  agencyName: string;
  client: string;
  grossCents: number;
  netCents: number;
  status: "paid" | "invoiced" | "pending" | "confirmed";
  source: "agency_routed" | "personal_page" | "hub" | "unknown";
  paymentMethod: string | null;
};

export type TalentEarningsPerAgency = {
  tenantId: string;
  slug: string;
  name: string;
  ytdNetCents: number;
  bookingsCount: number;
  lastBookingAt: string | null;
  commissionBps: number;
  rosterStatus?: string;
  plan?: string;
  isPrimary?: boolean;
};

export type TalentEarnings = {
  totals: {
    ytdGrossCents: number;
    ytdNetCents: number;
    pendingCents: number;
    confirmedPipelineCents: number;
    currency: "EUR";
  };
  perAgency: TalentEarningsPerAgency[];
  rows: TalentEarningsRow[];
};

export const EMPTY_TALENT_EARNINGS: TalentEarnings = {
  totals: {
    ytdGrossCents: 0,
    ytdNetCents: 0,
    pendingCents: 0,
    confirmedPipelineCents: 0,
    currency: "EUR",
  },
  perAgency: [],
  rows: [],
};

export type TalentSnapshotAggregateRow = {
  bookingId: string;
  bookingTalentId: string;
  tenantId: string;
  agencySlug: string;
  agencyName: string;
  workDate: string;
  payoutDate: string | null;
  clientLabel: string;
  grossCents: number;
  netCents: number;
  workspaceFeeCents: number;
  status: TalentEarningsRow["status"];
  source: TalentEarningsRow["source"];
  paymentMethod: string | null;
};

type BookingPayoutFields = {
  payout_lifecycle: string;
  payment_status: string;
  status: string;
};

export function mapBookingPayoutStatus(
  booking: BookingPayoutFields,
): TalentEarningsRow["status"] {
  if (booking.payout_lifecycle === "paid") return "paid";
  if (booking.payout_lifecycle === "scheduled") return "invoiced";
  if (booking.status === "cancelled") return "confirmed";
  if (
    booking.payment_status === "paid"
    || booking.payment_status === "partially_paid"
  ) {
    return "pending";
  }
  return "confirmed";
}

function averageCommissionBps(rows: TalentSnapshotAggregateRow[]): number {
  const rates = rows
    .filter((row) => row.grossCents > 0)
    .map((row) => Math.round((row.workspaceFeeCents / row.grossCents) * 10_000));
  if (rates.length === 0) return 0;
  return Math.round(rates.reduce((sum, bps) => sum + bps, 0) / rates.length);
}

/** Pure builder — used by loadTalentEarnings and unit tests. */
export function buildTalentEarnings(rows: TalentSnapshotAggregateRow[]): TalentEarnings {
  let ytdGrossCents = 0;
  let ytdNetCents = 0;
  let pendingCents = 0;
  let confirmedPipelineCents = 0;

  for (const row of rows) {
    ytdGrossCents += row.grossCents;
    ytdNetCents += row.netCents;
    if (row.status === "invoiced" || row.status === "pending") {
      pendingCents += row.netCents;
    } else if (row.status === "confirmed") {
      confirmedPipelineCents += row.netCents;
    }
  }

  const perAgencyMap = new Map<
    string,
    {
      tenantId: string;
      slug: string;
      name: string;
      ytdNetCents: number;
      bookingsCount: number;
      lastBookingAt: string | null;
      rows: TalentSnapshotAggregateRow[];
    }
  >();

  for (const row of rows) {
    const existing = perAgencyMap.get(row.tenantId);
    if (existing) {
      existing.ytdNetCents += row.netCents;
      existing.bookingsCount += 1;
      existing.rows.push(row);
      if (!existing.lastBookingAt || row.workDate > existing.lastBookingAt) {
        existing.lastBookingAt = row.workDate;
      }
    } else {
      perAgencyMap.set(row.tenantId, {
        tenantId: row.tenantId,
        slug: row.agencySlug,
        name: row.agencyName,
        ytdNetCents: row.netCents,
        bookingsCount: 1,
        lastBookingAt: row.workDate,
        rows: [row],
      });
    }
  }

  const perAgency = [...perAgencyMap.values()]
    .map(({ rows: agencyRows, ...agency }) => ({
      ...agency,
      commissionBps: averageCommissionBps(agencyRows),
    }))
    .sort((a, b) => b.ytdNetCents - a.ytdNetCents);

  return {
    totals: {
      ytdGrossCents,
      ytdNetCents,
      pendingCents,
      confirmedPipelineCents,
      currency: "EUR",
    },
    perAgency,
    rows: rows.map((row) => ({
      id: row.bookingTalentId,
      workDate: row.workDate,
      payoutDate: row.payoutDate,
      agencyName: row.agencyName,
      client: row.clientLabel,
      grossCents: row.grossCents,
      netCents: row.netCents,
      status: row.status,
      source: row.source,
      paymentMethod: row.paymentMethod,
    })),
  };
}
