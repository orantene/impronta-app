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
    /**
     * ISO-4217 currency code for the rows aggregated here. Historically
     * always "EUR"; multi-currency loader sets this to the per-bundle code.
     * Widened from the literal "EUR" to `string` so each per-currency
     * bundle carries its own code (L49 / talent Money tabs).
     */
    currency: string;
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
    // USD-first default (platform operates in USD); per-currency bundles
    // overwrite this with their own code.
    currency: "USD",
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
  /**
   * ISO-4217 currency code from `booking_commission_snapshot.currency_code`.
   * Present only when the aggregation fetcher ran with `includeAllCurrencies:
   * true`; EUR-only callers will get `undefined` here (treated as "EUR"
   * downstream). Added for the talent Money tabs feature (L49).
   */
  currencyCode?: string;
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

/**
 * The date a talent's money for a booking actually LANDED — used to window the
 * Money dashboard ("Paid this month") on the PAY date, not the shoot date.
 *
 * Audit #14: the loader historically stamped `payoutDate = shoot date` whenever
 * a booking was paid out, so a job shot in May but paid in June counted under
 * May — and "Paid this month" missed it entirely. The true payout date is when
 * the talent's transfer settled (`booking_payouts.transferred_at`, talent leg).
 *
 * Precedence:
 *   1. `transferredAtIso` — the real Stripe transfer settlement date (preferred).
 *   2. legacy fallback — a `paid` booking with no ledger transfer date (predates
 *      the payout ledger) keeps its old behaviour (shoot date) so it still
 *      counts as paid somewhere rather than vanishing.
 *   3. otherwise null (not yet paid out → no payout date).
 *
 * Returns a `YYYY-MM-DD` date string (or null). `transferredAtIso` may be a full
 * timestamp; it is truncated to the calendar date.
 */
export function resolveEarningsPayoutDate(args: {
  transferredAtIso: string | null;
  workDateIso: string;
  payoutLifecycle: string;
}): string | null {
  if (args.transferredAtIso) {
    const d = args.transferredAtIso.slice(0, 10);
    if (d) return d;
  }
  if (args.payoutLifecycle === "paid") return args.workDateIso;
  return null;
}

/**
 * Whether a booking row belongs in the talent's earnings window (since → now).
 *
 * Audit #14: a booking is kept when EITHER its shoot date OR its payout date
 * falls in the window. Keeping the shoot-date arm preserves the unpaid pipeline
 * (confirmed/pending jobs this year that haven't paid out yet); adding the
 * payout-date arm fixes the cross-year hole where a job shot last December but
 * PAID this January would otherwise be filtered out before "Paid this month"
 * ever saw it.
 */
export function isWithinEarningsWindow(
  workDateIso: string,
  payoutDateIso: string | null,
  sinceMs: number,
): boolean {
  const workMs = Date.parse(workDateIso);
  if (Number.isFinite(workMs) && workMs >= sinceMs) return true;
  if (payoutDateIso) {
    const payMs = Date.parse(payoutDateIso);
    if (Number.isFinite(payMs) && payMs >= sinceMs) return true;
  }
  return false;
}

function averageCommissionBps(rows: TalentSnapshotAggregateRow[]): number {
  const rates = rows
    .filter((row) => row.grossCents > 0)
    .map((row) => Math.round((row.workspaceFeeCents / row.grossCents) * 10_000));
  if (rates.length === 0) return 0;
  return Math.round(rates.reduce((sum, bps) => sum + bps, 0) / rates.length);
}

/**
 * Pure builder — used by `loadTalentEarnings` and unit tests.
 *
 * `opts.currency` overrides the default "EUR" label in `totals.currency`.
 * Used by the by-currency loader so each per-currency bundle reports its own
 * ISO code (matching the `buildAgencyFinancials` pattern from L49).
 */
export function buildTalentEarnings(
  rows: TalentSnapshotAggregateRow[],
  opts?: { currency?: string },
): TalentEarnings {
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
      currency: opts?.currency ?? "USD",
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
