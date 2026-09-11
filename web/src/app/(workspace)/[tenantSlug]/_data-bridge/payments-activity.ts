import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { TakingsSourceRow, DrawerSessionRow, OwedSourceRow } from "@/lib/payments/activity-shape";

/**
 * _data-bridge/payments-activity.ts — the I/O half of the Payments page.
 *
 * `lib/payments/activity-shape.ts` decides how rows GROUP; this file only
 * fetches, from `booking_transactions` (every payment and refund, across
 * every kind of sale this platform has) and `pos_shifts` (drawer sessions).
 *
 * Deliberately does NOT import anything from `lib/pos/*` — the point-of-sale
 * library belongs to the counter-screen slice.
 *
 * HOW THE TENDER IS READ, and why it is this column. `settleAtDoor` — the one
 * writer of an at-counter tender — puts the whole bag, `paid_via` included,
 * into `booking_transactions.metadata`. This file used to read
 * `provider_metadata` instead, which nothing writes a `paid_via` into: every
 * manual row therefore came back with `paidVia: null` and the screen showed a
 * drawer of cash and a counter card swipe as one "other" bucket. Reproduced
 * on the isolated branch through the real settle path, then fixed here and
 * re-run; see `20261231020400_booking_transactions_metadata_for_takings.sql`,
 * which is also what makes the column safe to select in production.
 *
 * `provider_metadata` is left alone on purpose. That bag belongs to the
 * provider — `markPaid` writes Stripe's `payment_intent_id` into it and a
 * refund reads it back — and how a cashier took the money is not a fact
 * Stripe would recognise.
 *
 * `PAYMENT_METHOD_COLUMN` and `PAID_VIA_KEY` are named constants rather than
 * inline strings so `payments-method-source.static.test.ts` can hold this
 * reader and `lib/orders/settle-at-door.ts` to the same column and the same
 * key. That guard is the one that would have caught the original defect.
 */

const PAID = "paid";
const REFUNDED = "refunded";

/** The `booking_transactions` jsonb column the at-counter tender bag is written into. */
export const PAYMENT_METHOD_COLUMN = "metadata";
/** The key inside that bag naming how the money was taken. */
export const PAID_VIA_KEY = "paid_via";

function asMeta(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function paidViaOf(raw: unknown): string | null {
  const meta = asMeta(raw);
  const v = meta[PAID_VIA_KEY];
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
export async function loadTenantTakings(
  tenantId: string,
  opts: {
    limit?: number;
    /** ISO instant; only money that landed at or after it (the Overview's "today"). */
    since?: string;
  } = {},
): Promise<TakingsLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  const limit = Math.min(Math.max(opts.limit ?? 1000, 1), 2000);
  let query = admin
    .from("booking_transactions")
    .select(`gross_amount_cents, currency, provider, ${PAYMENT_METHOD_COLUMN}`)
    .eq("source_tenant_id", tenantId)
    .eq("status", PAID);
  if (opts.since) query = query.gte("paid_at", opts.since);
  const { data, error } = await query.order("paid_at", { ascending: false }).limit(limit);
  if (error) {
    logServerError("dataBridge.paymentsActivity/takings", error);
    return { ok: false };
  }
  const rows: TakingsSourceRow[] = (data ?? []).map((raw) => {
    const row = raw as {
      gross_amount_cents: number | string;
      currency: string | null;
      provider: string | null;
      metadata: unknown;
    };
    return {
      grossAmountCents: num(row.gross_amount_cents),
      currency: row.currency ?? "USD",
      provider: row.provider ?? "manual",
      paidVia: paidViaOf(row.metadata),
    };
  });
  return { ok: true, rows };
}

export type OwedLoad = { ok: true; rows: OwedSourceRow[] } | { ok: false };

/** Rows per page, and per `in()` list. PostgREST answers at most 1000 rows a call. */
const OWED_PAGE = 500;

/**
 * Every order still awaiting payment for this tenant, with what has landed on
 * each — the WHOLE set, paged, not a window.
 *
 * `loadWorkspaceOrders` reads the 200 most recent orders because it feeds a
 * list. This page used to sum "Still owed" over that list, so on any workspace
 * with more than 200 orders the figure quietly dropped every older unpaid
 * order and still called itself the sum. A total has to be over the set.
 *
 * The predicate is the desk's own: `status = 'pending_payment'` is the
 * `to_pay` bucket in `lib/orders/orders-list.ts`, and `total_cents > 0` is
 * `salesBucket`'s complimentary-place exception applied at the query so a
 * thousand free places do not have to be read to be discarded. The
 * collected side is PAID `booking_transactions`, the same rule
 * `loadWorkspaceOrders` and `complete-order.ts` use, so this figure and the
 * desk's per-order balance cannot disagree about a row.
 */
export async function loadTenantOwedOrders(tenantId: string): Promise<OwedLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };

  type OrderRow = { id: string; status: string; currency: string | null; total_cents: number | string };
  const orders: OrderRow[] = [];
  for (let from = 0; ; from += OWED_PAGE) {
    const { data, error } = await admin
      .from("orders")
      .select("id, status, currency, total_cents")
      .eq("tenant_id", tenantId)
      .eq("status", "pending_payment")
      .gt("total_cents", 0)
      .order("created_at", { ascending: false })
      .range(from, from + OWED_PAGE - 1);
    if (error) {
      logServerError("dataBridge.paymentsActivity/owedOrders", error);
      return { ok: false };
    }
    const page = (data ?? []) as OrderRow[];
    orders.push(...page);
    if (page.length < OWED_PAGE) break;
  }
  if (orders.length === 0) return { ok: true, rows: [] };

  const collected = new Map<string, number>();
  for (let i = 0; i < orders.length; i += OWED_PAGE) {
    const ids = orders.slice(i, i + OWED_PAGE).map((o) => o.id);
    const { data, error } = await admin
      .from("booking_transactions")
      .select("order_id, gross_amount_cents")
      .in("order_id", ids)
      .eq("status", PAID);
    if (error) {
      logServerError("dataBridge.paymentsActivity/owedCollected", error);
      return { ok: false };
    }
    for (const raw of data ?? []) {
      const row = raw as { order_id: string | null; gross_amount_cents: number | string | null };
      if (!row.order_id) continue;
      collected.set(row.order_id, (collected.get(row.order_id) ?? 0) + num(row.gross_amount_cents));
    }
  }

  const rows: OwedSourceRow[] = orders.map((o) => ({
    status: o.status,
    currency: o.currency ?? "USD",
    totalCents: num(o.total_cents),
    collectedCents: collected.get(o.id) ?? 0,
  }));
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
