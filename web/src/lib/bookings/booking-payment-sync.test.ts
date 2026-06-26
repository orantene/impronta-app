import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOOKING_TERMINAL_PAYMENT_STATUSES,
  applyBookingPaymentSync,
  buildBookingPaymentPatch,
} from "./booking-payment-sync";

const NOW = "2026-06-24T00:00:00.000Z";

test("buildBookingPaymentPatch: deposit → partial / deposit_paid + deposit timestamps", () => {
  const p = buildBookingPaymentPatch(true, NOW);
  assert.equal(p.payment_status, "partial");
  assert.equal(p.client_revenue_lifecycle, "deposit_paid");
  assert.equal(p.deposit_paid_at, NOW);
  assert.equal(p.balance_due_at, NOW);
});

test("buildBookingPaymentPatch: balance/full → paid / fully_paid, no deposit timestamps", () => {
  const p = buildBookingPaymentPatch(false, NOW);
  assert.equal(p.payment_status, "paid");
  assert.equal(p.client_revenue_lifecycle, "fully_paid");
  assert.equal(p.deposit_paid_at, undefined);
  assert.equal(p.balance_due_at, undefined);
});

/** Records the Supabase update chain so we can assert the monotonic guard. */
function makeFakeSb() {
  const calls = {
    table: null as string | null,
    patch: null as Record<string, unknown> | null,
    eq: null as [string, string] | null,
    not: [] as Array<[string, string, string]>,
  };
  const builder = {
    update(patch: Record<string, unknown>) {
      calls.patch = patch;
      return builder;
    },
    eq(col: string, val: string) {
      calls.eq = [col, val];
      return builder;
    },
    not(col: string, op: string, val: string) {
      calls.not.push([col, op, val]);
      return builder;
    },
    then(resolve: (r: { error: null }) => void) {
      resolve({ error: null });
    },
  };
  const sb = {
    from(table: string) {
      calls.table = table;
      return builder;
    },
  };
  return { sb, calls };
}

test("applyBookingPaymentSync: deposit applies the atomic terminal-state guard", async () => {
  const { sb, calls } = makeFakeSb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await applyBookingPaymentSync(sb as any, { bookingId: "bk1", isDeposit: true, nowIso: NOW });
  assert.equal(calls.table, "agency_bookings");
  assert.deepEqual(calls.eq, ["id", "bk1"]);
  assert.deepEqual(calls.not, [
    ["payment_status", "in", "(paid,refunded,cancelled)"],
  ]);
  assert.equal((calls.patch as Record<string, string>).payment_status, "partial");
});

test("applyBookingPaymentSync: balance/full payment is unguarded (terminal write)", async () => {
  const { sb, calls } = makeFakeSb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await applyBookingPaymentSync(sb as any, { bookingId: "bk1", isDeposit: false, nowIso: NOW });
  assert.deepEqual(calls.not, []);
  assert.equal((calls.patch as Record<string, string>).payment_status, "paid");
});

test("guard list matches the terminal statuses", () => {
  assert.deepEqual([...BOOKING_TERMINAL_PAYMENT_STATUSES], ["paid", "refunded", "cancelled"]);
});
