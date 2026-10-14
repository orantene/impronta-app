/**
 * What the ledger (`booking_transactions`) says was actually collected per
 * booking, split by method. Money "Collected", the Payments / Cash split and
 * the client record read this so a recorded payment shows up after reload.
 *
 * Method resolution per row: `metadata.paid_via` (manual and till rows), else
 * a non-manual provider is card, else "other".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { MONEY_IN_STATUSES } from "./manual-payment";

export type LedgerPaidRow = {
  booking_id: string;
  gross_amount_cents: number | string | null;
  status: string;
  provider: string | null;
  metadata?: unknown;
  currency?: string | null;
  paid_at?: string | null;
  /** Set on a refund row: the sale it refunds. */
  refund_of_transaction_id?: string | null;
};

export type LedgerPaid = {
  paidCents: number;
  byMethod: Record<string, number>;
  /** Method of the most recent money-in row. */
  lastMethod: string | null;
  lastPaidAt: string | null;
  currency: string | null;
  /** Money handed back through linked refund rows (status refunded + refund_of_transaction_id). Not part of paidCents. */
  refundedCents?: number;
  /** True when any money-in row was stamped paid_after_cancellation (refund from Money). */
  paidAfterCancellation?: boolean;
};

export function ledgerRowMethod(row: Pick<LedgerPaidRow, "provider" | "metadata">): string {
  const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const via = typeof meta.paid_via === "string" ? meta.paid_via.trim().toLowerCase() : "";
  if (via) return via;
  if (row.provider && row.provider !== "manual") return "card";
  return "other";
}

export function summarizeLedgerPaid(rows: readonly LedgerPaidRow[]): Map<string, LedgerPaid> {
  const out = new Map<string, LedgerPaid>();
  for (const r of rows) {
    if (r.status === "refunded" && r.refund_of_transaction_id) {
      const refunded = Math.max(0, Math.round(Number(r.gross_amount_cents)) || 0);
      if (refunded > 0) {
        const cur = out.get(r.booking_id) ?? { paidCents: 0, byMethod: {}, lastMethod: null, lastPaidAt: null, currency: null };
        cur.refundedCents = (cur.refundedCents ?? 0) + refunded;
        out.set(r.booking_id, cur);
      }
      continue;
    }
    if (!(MONEY_IN_STATUSES as readonly string[]).includes(r.status)) continue;
    const cents = Math.max(0, Math.round(Number(r.gross_amount_cents)) || 0);
    if (cents === 0) continue;
    const method = ledgerRowMethod(r);
    const cur = out.get(r.booking_id) ?? {
      paidCents: 0,
      byMethod: {},
      lastMethod: null,
      lastPaidAt: null,
      currency: null,
    };
    cur.paidCents += cents;
    cur.byMethod[method] = (cur.byMethod[method] ?? 0) + cents;
    const meta = r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {};
    if (meta.needs_attention === "paid_after_cancellation") {
      cur.paidAfterCancellation = true;
    }
    const at = r.paid_at ?? null;
    if (!cur.lastPaidAt || (at && at >= cur.lastPaidAt)) {
      cur.lastMethod = method;
      cur.lastPaidAt = at ?? cur.lastPaidAt;
    }
    if (!cur.currency && r.currency) cur.currency = r.currency.toUpperCase();
    out.set(r.booking_id, cur);
  }
  return out;
}

/**
 * Read money-in rows for bookings the caller has ALREADY scoped to the viewer
 * (pass the service-role client: talents have no RLS read on manual rows).
 * Returns an empty map on error so Money still renders the snapshot view.
 */
export async function loadLedgerPaidByBooking(
  client: Pick<SupabaseClient, "from">,
  bookingIds: readonly string[],
): Promise<Map<string, LedgerPaid>> {
  if (bookingIds.length === 0) return new Map();
  const { data, error } = await client
    .from("booking_transactions")
    .select("booking_id, gross_amount_cents, status, provider, metadata, currency, paid_at, refund_of_transaction_id")
    .in("booking_id", [...bookingIds])
    .in("status", [...MONEY_IN_STATUSES, "refunded"]);
  if (error) return new Map();
  return summarizeLedgerPaid((data ?? []) as LedgerPaidRow[]);
}
