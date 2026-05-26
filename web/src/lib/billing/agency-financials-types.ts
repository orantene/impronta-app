/**
 * Types + pure builder for `loadAgencyFinancials`.
 *
 * Mirrors the talent-side `TalentEarnings` shape (see
 * `web/src/lib/talent/earnings-types.ts`) but projects the
 * `booking_commission_snapshot` lanes through the *agency* lens:
 *
 *   - `grossCents`            → total revenue
 *   - `platformFeeCents`      → cost paid to Tulala
 *   - `workspaceFeeCents`     → agency commission earned
 *   - `talentNetCents`        → payout owed/paid to talent
 *
 * Both surfaces aggregate the same rows so the cents agree. Decision-log
 * L43 + the upcoming admin-financials decision (next free L) cement the
 * "separate projection, same source" rule — never merge with `/talent/money`.
 */

import type { TalentEarningsRow } from "@/lib/talent/earnings-types";

export type AgencyFinancialsRow = {
  bookingId: string;
  bookingTalentId: string;
  participantId: string;
  tenantId: string;
  workDate: string;
  payoutDate: string | null;
  clientLabel: string;
  /** Talent on the booking, when joinable. */
  talentProfileId: string | null;
  talentDisplayName: string | null;
  /** Commission lanes — all cents, EUR-only at v1. */
  grossCents: number;
  platformFeeCents: number;
  workspaceFeeCents: number;
  talentNetCents: number;
  /** Payment + booking status projected from agency_bookings. */
  status: TalentEarningsRow["status"];
  paymentMethod: string | null;
  /** Currency-as-stored. v1 reports EUR-only; non-EUR rows are excluded
   * upstream — present here only as defensive metadata. */
  currencyCode: string;
};

export type AgencyFinancialsPerTalent = {
  talentProfileId: string;
  talentDisplayName: string;
  bookingsCount: number;
  grossCents: number;
  workspaceFeeCents: number;
  talentNetCents: number;
  /** Sum of net amounts owed but not yet `payout_lifecycle = 'paid'`. */
  pendingPayoutCents: number;
  lastBookingAt: string | null;
};

export type AgencyFinancialsPerClient = {
  clientLabel: string;
  bookingsCount: number;
  grossCents: number;
  lastBookingAt: string | null;
};

export type AgencyFinancialsByPaymentStatus = {
  paid: { bookings: number; grossCents: number };
  invoiced: { bookings: number; grossCents: number };
  pending: { bookings: number; grossCents: number };
  confirmed: { bookings: number; grossCents: number };
};

export type AgencyFinancials = {
  totals: {
    /** Calendar-year totals across all rows. */
    ytdGrossCents: number;
    ytdPlatformFeeCents: number;
    ytdWorkspaceFeeCents: number;
    ytdTalentNetCents: number;
    /** Workspace lane owed but not yet paid out. */
    pendingPayoutCents: number;
    confirmedBookingsCount: number;
    /** ISO-4217 code of the rows aggregated here. Always one currency
     * per AgencyFinancials instance; the multi-currency variant returns
     * a Map of these keyed by currency code. */
    currency: string;
  };
  /** Month-to-date totals (calendar month, UTC). */
  mtd: {
    grossCents: number;
    platformFeeCents: number;
    workspaceFeeCents: number;
    talentNetCents: number;
  };
  perTalent: AgencyFinancialsPerTalent[];
  topClients: AgencyFinancialsPerClient[];
  byPaymentStatus: AgencyFinancialsByPaymentStatus;
  rows: AgencyFinancialsRow[];
};

export const EMPTY_AGENCY_FINANCIALS: AgencyFinancials = {
  totals: {
    ytdGrossCents: 0,
    ytdPlatformFeeCents: 0,
    ytdWorkspaceFeeCents: 0,
    ytdTalentNetCents: 0,
    pendingPayoutCents: 0,
    confirmedBookingsCount: 0,
    currency: "EUR",
  },
  mtd: {
    grossCents: 0,
    platformFeeCents: 0,
    workspaceFeeCents: 0,
    talentNetCents: 0,
  },
  perTalent: [],
  topClients: [],
  byPaymentStatus: {
    paid: { bookings: 0, grossCents: 0 },
    invoiced: { bookings: 0, grossCents: 0 },
    pending: { bookings: 0, grossCents: 0 },
    confirmed: { bookings: 0, grossCents: 0 },
  },
  rows: [],
};

function firstOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Pure builder — given a list of rows (already filtered by `since` and,
 * for the by-currency caller, already filtered to one currency code),
 * aggregate into the agency-financials projection. Exposed for tests so
 * we can drive the math without a Supabase fixture.
 *
 * `opts.currency` overrides the default "EUR" label — used by the by-
 * currency loader so each per-currency bundle reports its own ISO code.
 */
export function buildAgencyFinancials(
  rows: AgencyFinancialsRow[],
  opts?: { mtdSinceIso?: string; currency?: string },
): AgencyFinancials {
  const totals = { ...EMPTY_AGENCY_FINANCIALS.totals, currency: opts?.currency ?? "EUR" };
  const mtd = { ...EMPTY_AGENCY_FINANCIALS.mtd };
  const byPaymentStatus: AgencyFinancialsByPaymentStatus = {
    paid: { bookings: 0, grossCents: 0 },
    invoiced: { bookings: 0, grossCents: 0 },
    pending: { bookings: 0, grossCents: 0 },
    confirmed: { bookings: 0, grossCents: 0 },
  };
  const mtdSince = Date.parse(opts?.mtdSinceIso ?? firstOfMonthIso());
  const confirmedBookings = new Set<string>();

  const perTalent = new Map<string, AgencyFinancialsPerTalent>();
  const perClient = new Map<string, AgencyFinancialsPerClient>();

  for (const row of rows) {
    totals.ytdGrossCents += row.grossCents;
    totals.ytdPlatformFeeCents += row.platformFeeCents;
    totals.ytdWorkspaceFeeCents += row.workspaceFeeCents;
    totals.ytdTalentNetCents += row.talentNetCents;
    if (row.status !== "paid") {
      totals.pendingPayoutCents += row.workspaceFeeCents;
    }
    if (row.status === "paid" || row.status === "confirmed" || row.status === "pending") {
      confirmedBookings.add(row.bookingId);
    }

    const workTs = Date.parse(row.workDate);
    if (!Number.isNaN(workTs) && workTs >= mtdSince) {
      mtd.grossCents += row.grossCents;
      mtd.platformFeeCents += row.platformFeeCents;
      mtd.workspaceFeeCents += row.workspaceFeeCents;
      mtd.talentNetCents += row.talentNetCents;
    }

    byPaymentStatus[row.status].bookings += 1;
    byPaymentStatus[row.status].grossCents += row.grossCents;

    if (row.talentProfileId) {
      const existing = perTalent.get(row.talentProfileId);
      if (existing) {
        existing.bookingsCount += 1;
        existing.grossCents += row.grossCents;
        existing.workspaceFeeCents += row.workspaceFeeCents;
        existing.talentNetCents += row.talentNetCents;
        if (row.status !== "paid") {
          existing.pendingPayoutCents += row.talentNetCents;
        }
        if (!existing.lastBookingAt || row.workDate > existing.lastBookingAt) {
          existing.lastBookingAt = row.workDate;
        }
      } else {
        perTalent.set(row.talentProfileId, {
          talentProfileId: row.talentProfileId,
          talentDisplayName: row.talentDisplayName ?? "Talent",
          bookingsCount: 1,
          grossCents: row.grossCents,
          workspaceFeeCents: row.workspaceFeeCents,
          talentNetCents: row.talentNetCents,
          pendingPayoutCents: row.status === "paid" ? 0 : row.talentNetCents,
          lastBookingAt: row.workDate,
        });
      }
    }

    const existingClient = perClient.get(row.clientLabel);
    if (existingClient) {
      existingClient.bookingsCount += 1;
      existingClient.grossCents += row.grossCents;
      if (!existingClient.lastBookingAt || row.workDate > existingClient.lastBookingAt) {
        existingClient.lastBookingAt = row.workDate;
      }
    } else {
      perClient.set(row.clientLabel, {
        clientLabel: row.clientLabel,
        bookingsCount: 1,
        grossCents: row.grossCents,
        lastBookingAt: row.workDate,
      });
    }
  }

  totals.confirmedBookingsCount = confirmedBookings.size;

  const perTalentSorted = [...perTalent.values()].sort(
    (a, b) => b.talentNetCents - a.talentNetCents,
  );
  const topClients = [...perClient.values()]
    .sort((a, b) => b.grossCents - a.grossCents)
    .slice(0, 10);

  return {
    totals,
    mtd,
    perTalent: perTalentSorted,
    topClients,
    byPaymentStatus,
    rows: [...rows].sort((a, b) => b.workDate.localeCompare(a.workDate)),
  };
}
