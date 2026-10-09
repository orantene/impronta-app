/**
 * TUL-430: the Pago tab's booking and money row. Two bookings on one inquiry,
 * and a refunded payment, must both show instead of "no booking yet".
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/bookings/payment-booking.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadInquiryPaymentBooking } from "./payment-booking";

type Row = Record<string, unknown>;

const booking = (id: string, over: Row = {}) => ({
  id,
  total_client_revenue: 1000,
  currency_code: "MXN",
  deposit_amount_cents: null,
  deposit_pct: null,
  client_revenue_lifecycle: null,
  ...over,
});
const txn = (id: string, bookingId: string, status: string): Row => ({
  id,
  booking_id: bookingId,
  source_tenant_id: "t1",
  source_inquiry_id: "i1",
  gross_amount_cents: 100000,
  platform_fee_basis_points: 0,
  platform_fee_cents: 0,
  net_amount_cents: 100000,
  currency: "MXN",
  status,
  // Far-future stamp: fixture only (never compared to the clock). Avoids the
  // rotting-date guard in src/lib/quality/test-fixed-dates.static.test.ts.
  created_at: "2030-06-15T15:00:00Z",
});

/** bookings -> list; booking_transactions: `active` per booking id for the active-only query, `latest` for the any-status one. */
function fake(opts: { bookings: Row[] | null; bookingsError?: boolean; active?: Record<string, Row>; latest?: Row | null; latestError?: boolean }) {
  const from = (table: string) => {
    let activeFor: string | null = null;
    let isIn = false;
    const api: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "not", "or"]) api[m] = () => api;
    api.eq = (k: string, v: string) => {
      if (k === "booking_id") activeFor = v;
      return api;
    };
    api.in = () => ((isIn = true), api);
    api.maybeSingle = async () => {
      if (isIn) return opts.latestError ? { data: null, error: { message: "x" } } : { data: opts.latest ?? null, error: null };
      return { data: (activeFor && opts.active?.[activeFor]) || null, error: null };
    };
    api.then = (resolve: (v: unknown) => unknown) =>
      resolve(table === "agency_bookings" ? (opts.bookingsError ? { data: null, error: { message: "x" } } : { data: opts.bookings, error: null }) : { data: null, error: null });
    return api;
  };
  return { from } as unknown as SupabaseClient;
}

const q = { tenantId: "t1", inquiryId: "i1" };

test("two bookings on one inquiry no longer read as 'no booking': the one with an active money row wins", async () => {
  const sb = fake({ bookings: [booking("b-new"), booking("b-old")], active: { "b-old": txn("tx1", "b-old", "payment_requested") } });
  const r = await loadInquiryPaymentBooking(sb, q);
  assert.equal(r.ok && r.booking?.id, "b-old");
  assert.equal(r.ok && r.transaction?.id, "tx1");
});

test("a refunded payment still shows (no active row, the latest any-status row is used) with ITS booking", async () => {
  const sb = fake({ bookings: [booking("b-new"), booking("b-old")], active: {}, latest: txn("tx2", "b-old", "refunded") });
  const r = await loadInquiryPaymentBooking(sb, q);
  assert.equal(r.ok && r.booking?.id, "b-old");
  assert.equal(r.ok && r.transaction?.status, "refunded");
});

test("a booking with no money row at all returns the newest booking and no transaction", async () => {
  const r = await loadInquiryPaymentBooking(fake({ bookings: [booking("b1")], active: {}, latest: null }), q);
  assert.equal(r.ok && r.booking?.id, "b1");
  assert.equal(r.ok && r.transaction, null);
});

test("no booking is ok:true with nothing, a failed read is ok:false (never 'no booking')", async () => {
  const none = await loadInquiryPaymentBooking(fake({ bookings: [] }), q);
  assert.deepEqual(none, { ok: true, booking: null, transaction: null });
  assert.deepEqual(await loadInquiryPaymentBooking(fake({ bookings: null, bookingsError: true }), q), { ok: false });
  assert.deepEqual(await loadInquiryPaymentBooking(fake({ bookings: [booking("b1")], latestError: true }), q), { ok: false });
});
