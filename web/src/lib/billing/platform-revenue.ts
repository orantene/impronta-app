/**
 * P5 — platform booking-revenue aggregation (platform-admin dashboard).
 *
 * Rolls up realized booking money across ALL tenants from the per-participant
 * commission snapshots (`booking_commission_snapshot`), classified by the
 * `booking_transactions` lifecycle so we only count money that actually
 * settled:
 *
 *   • REALIZED  — a booking with a paid / payout_* / disputed original
 *     transaction and no refund. Its snapshot lanes are live revenue.
 *   • REFUNDED  — a booking whose payment was refunded. Surfaced separately so
 *     the platform-fee total reflects clawed-back money, not gross intake.
 *
 * Lanes (talent-protected model): the platform keeps `platform_fee_cents`
 * (client surcharge + seller deduction), the talent is paid `talent_net_cents`
 * in full, the workspace receives `workspace_fee_cents` (margin + base fee),
 * and the client is charged `gross_charged_cents`.
 *
 * Read-only, platform-admin only (the /platform/admin layout gates super_admin
 * before this runs). Aggregation happens in-process; for the pre-launch /
 * early-volume horizon this is fine. A hard cap guards against unbounded reads
 * and is reported (never silently truncated) so the number is trustworthy.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

const SNAPSHOT_CAP = 5000;

export type PlatformRevenueByCurrency = {
  currency: string;
  bookings: number;
  grossChargedCents: number;
  platformFeeCents: number;
  clientSurchargeCents: number;
  workspaceFeeCents: number;
  talentNetCents: number;
  refundedBookings: number;
  refundedPlatformFeeCents: number;
};

export type PlatformRevenueSummary = {
  byCurrency: PlatformRevenueByCurrency[];
  totalBookings: number;
  totalRefundedBookings: number;
  hasData: boolean;
  /** True when the snapshot read hit SNAPSHOT_CAP — totals are a floor, not exact. */
  truncated: boolean;
};

const EMPTY: PlatformRevenueSummary = {
  byCurrency: [],
  totalBookings: 0,
  totalRefundedBookings: 0,
  hasData: false,
  truncated: false,
};

type BookingState = "realized" | "refunded";

export async function loadPlatformBookingRevenue(): Promise<PlatformRevenueSummary> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY;

  try {
    // 1) Classify every settled-or-refunded booking by its transaction lifecycle.
    const { data: txns, error: txnErr } = await sb
      .from("booking_transactions")
      .select("booking_id, status, refund_of_transaction_id")
      .in("status", ["paid", "payout_pending", "payout_sent", "disputed", "refunded"]);
    if (txnErr) {
      logServerError("platform-revenue.transactions", txnErr);
      return EMPTY;
    }

    const state = new Map<string, BookingState>();
    for (const t of txns ?? []) {
      const bookingId = t.booking_id as string | null;
      if (!bookingId) continue;
      // A refund (its own row, or the original flipped to refunded) wins — it
      // marks the booking's money as clawed back.
      if (t.status === "refunded") {
        state.set(bookingId, "refunded");
      } else if (!state.has(bookingId)) {
        state.set(bookingId, "realized");
      }
    }
    if (state.size === 0) return EMPTY;

    // 2) Pull the per-participant snapshot lanes for those bookings.
    const bookingIds = [...state.keys()];
    const { data: snaps, error: snapErr } = await sb
      .from("booking_commission_snapshot")
      .select(
        "booking_id, currency_code, gross_charged_cents, platform_fee_cents, client_surcharge_cents, workspace_fee_cents, talent_net_cents",
      )
      .in("booking_id", bookingIds)
      .limit(SNAPSHOT_CAP);
    if (snapErr) {
      logServerError("platform-revenue.snapshots", snapErr);
      return EMPTY;
    }
    const rows = snaps ?? [];
    const truncated = rows.length >= SNAPSHOT_CAP;
    if (truncated) {
      logServerError(
        "platform-revenue.truncated",
        new Error(`snapshot read hit cap ${SNAPSHOT_CAP}; revenue totals are a floor`),
      );
    }

    // 3) Aggregate by currency, splitting realized vs refunded.
    const byCur = new Map<string, PlatformRevenueByCurrency>();
    const realizedBookings = new Set<string>();
    const refundedBookings = new Set<string>();

    for (const r of rows) {
      const bookingId = r.booking_id as string;
      const st = state.get(bookingId);
      if (!st) continue;
      const cur = ((r.currency_code as string) || "usd").toLowerCase();
      let agg = byCur.get(cur);
      if (!agg) {
        agg = {
          currency: cur,
          bookings: 0,
          grossChargedCents: 0,
          platformFeeCents: 0,
          clientSurchargeCents: 0,
          workspaceFeeCents: 0,
          talentNetCents: 0,
          refundedBookings: 0,
          refundedPlatformFeeCents: 0,
        };
        byCur.set(cur, agg);
      }
      const platformFee = (r.platform_fee_cents as number) ?? 0;
      if (st === "realized") {
        realizedBookings.add(bookingId);
        agg.grossChargedCents += (r.gross_charged_cents as number) ?? 0;
        agg.platformFeeCents += platformFee;
        agg.clientSurchargeCents += (r.client_surcharge_cents as number) ?? 0;
        agg.workspaceFeeCents += (r.workspace_fee_cents as number) ?? 0;
        agg.talentNetCents += (r.talent_net_cents as number) ?? 0;
      } else {
        refundedBookings.add(bookingId);
        agg.refundedPlatformFeeCents += platformFee;
      }
    }

    // Per-currency booking counts (distinct bookings, one snapshot may have N rows).
    for (const agg of byCur.values()) {
      agg.bookings = 0;
      agg.refundedBookings = 0;
    }
    // Recount distinct bookings per currency from the rows.
    const seen = new Set<string>();
    for (const r of rows) {
      const bookingId = r.booking_id as string;
      const key = `${(r.currency_code as string) || "usd"}::${bookingId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = ((r.currency_code as string) || "usd").toLowerCase();
      const agg = byCur.get(cur);
      if (!agg) continue;
      if (state.get(bookingId) === "realized") agg.bookings += 1;
      else if (state.get(bookingId) === "refunded") agg.refundedBookings += 1;
    }

    const byCurrency = [...byCur.values()].sort(
      (a, b) => b.platformFeeCents - a.platformFeeCents,
    );

    return {
      byCurrency,
      totalBookings: realizedBookings.size,
      totalRefundedBookings: refundedBookings.size,
      hasData: byCurrency.length > 0,
      truncated,
    };
  } catch (err) {
    logServerError("platform-revenue.load", err);
    return EMPTY;
  }
}
