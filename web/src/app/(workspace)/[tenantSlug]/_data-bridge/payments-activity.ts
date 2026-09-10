import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { TakingsSourceRow, DrawerSessionRow } from "@/lib/payments/activity-shape";

/**
 * _data-bridge/payments-activity.ts — the I/O half of the Payments page.
 *
 * `lib/payments/activity-shape.ts` decides how rows GROUP; this file only
 * fetches, from `booking_transactions` (every payment and refund, across
 * every kind of sale this platform has) and `pos_shifts` (drawer sessions).
 *
 * Deliberately does NOT import anything from `lib/pos/*` — the point-of-sale
 * library belongs to the counter-screen slice. `provider_metadata` is read
 * directly here rather than through `lib/pos/shift.ts`'s `metadata` column
 * name, which does not exist on `booking_transactions` (confirmed against
 * `database.types.ts`: the real jsonb column is `provider_metadata`). See
 * the handoff note in this program's report for that finding.
 */

const PAID = "paid";
const REFUNDED = "refunded";

function asMeta(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function paidViaOf(raw: unknown): string | null {
  const meta = asMeta(raw);
  const v = meta["paid_via"];
  return typeof v === "string" ? v : null;
}

function num(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export type TakingsLoad = { ok: true; rows: TakingsSourceRow[] } | { ok: false };

/** Every PAID transaction for this tenant — the money that actually landed. */
export async function loadTenantTakings(tenantId: string, opts: { limit?: number } = {}): Promise<TakingsLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  const limit = Math.min(Math.max(opts.limit ?? 1000, 1), 2000);
  const { data, error } = await admin
    .from("booking_transactions")
    .select("gross_amount_cents, currency, provider, provider_metadata")
    .eq("source_tenant_id", tenantId)
    .eq("status", PAID)
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (error) {
    logServerError("dataBridge.paymentsActivity/takings", error);
    return { ok: false };
  }
  const rows: TakingsSourceRow[] = (data ?? []).map((raw) => {
    const row = raw as {
      gross_amount_cents: number | string;
      currency: string | null;
      provider: string | null;
      provider_metadata: unknown;
    };
    return {
      grossAmountCents: num(row.gross_amount_cents),
      currency: row.currency ?? "USD",
      provider: row.provider ?? "manual",
      paidVia: paidViaOf(row.provider_metadata),
    };
  });
  return { ok: true, rows };
}

export type RefundRow = {
  id: string;
  grossAmountCents: number;
  currency: string;
  provider: string;
  refundedAt: string | null;
  orderId: string | null;
  bookingId: string | null;
  /** The transaction this refund reverses — the trace back to the original payment. */
  refundOfTransactionId: string | null;
};

export type RefundsLoad = { ok: true; rows: RefundRow[] } | { ok: false };

/**
 * Every COMPLETED refund — a second `booking_transactions` row with
 * `status='refunded'` and `refund_of_transaction_id` pointing at the payment
 * it reversed (see `lib/bookings/transactions.ts` `markRefunded`, and the
 * webhook path in `lib/payments/refunds.ts`). A refund that is still in
 * flight at the provider has no row here yet — this list is "what actually
 * moved," not "what was requested."
 */
export async function loadTenantRefunds(tenantId: string, opts: { limit?: number } = {}): Promise<RefundsLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { data, error } = await admin
    .from("booking_transactions")
    .select("id, gross_amount_cents, currency, provider, refunded_at, order_id, booking_id, refund_of_transaction_id")
    .eq("source_tenant_id", tenantId)
    .eq("status", REFUNDED)
    .order("refunded_at", { ascending: false })
    .limit(limit);
  if (error) {
    logServerError("dataBridge.paymentsActivity/refunds", error);
    return { ok: false };
  }
  const rows: RefundRow[] = (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      gross_amount_cents: number | string;
      currency: string | null;
      provider: string | null;
      refunded_at: string | null;
      order_id: string | null;
      booking_id: string | null;
      refund_of_transaction_id: string | null;
    };
    return {
      id: row.id,
      grossAmountCents: num(row.gross_amount_cents),
      currency: row.currency ?? "USD",
      provider: row.provider ?? "manual",
      refundedAt: row.refunded_at,
      orderId: row.order_id,
      bookingId: row.booking_id,
      refundOfTransactionId: row.refund_of_transaction_id,
    };
  });
  return { ok: true, rows };
}

export type DrawerSessionsLoad = { ok: true; rows: DrawerSessionRow[] } | { ok: false };

/**
 * Recent `pos_shifts` rows for this tenant, open first then most recently
 * opened. Reads the table directly rather than importing `lib/pos/shift.ts`
 * (out of this slice's files) — same four columns that module's own
 * `currentShift` reads, so the shape matches what the counter screen shows.
 */
export async function loadTenantDrawerSessions(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<DrawerSessionsLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const { data, error } = await admin
    .from("pos_shifts")
    .select("id, status, opened_at, closed_at, opening_cash_cents, closing_cash_cents, expected_cash_cents")
    .eq("tenant_id", tenantId)
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) {
    logServerError("dataBridge.paymentsActivity/drawerSessions", error);
    return { ok: false };
  }
  const rows: DrawerSessionRow[] = (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      status: string;
      opened_at: string | null;
      closed_at: string | null;
      opening_cash_cents: number | string;
      closing_cash_cents: number | string | null;
      expected_cash_cents: number | string | null;
    };
    return {
      id: row.id,
      status: row.status === "closed" ? "closed" : "open",
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      openingCashCents: num(row.opening_cash_cents),
      closingCashCents: row.closing_cash_cents == null ? null : num(row.closing_cash_cents),
      expectedCashCents: row.expected_cash_cents == null ? null : num(row.expected_cash_cents),
    };
  });
  // Open sessions first regardless of when they opened — a shift open right
  // now is the one a manager most needs to see, even if an older closed
  // shift technically sorts later by `opened_at` alone.
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return (b.openedAt ?? "").localeCompare(a.openedAt ?? "");
  });
  return { ok: true, rows };
}
