/**
 * MONEY BUG 4 (found by reading code at origin/main 356b18d4a7): a cancel
 * computed `refundableCents` and told the guest "a refund opens", but wrote no
 * refund intent anywhere, and three of the five cancel entry points never ran
 * `settleMoneyOnCancel` (pay links stayed payable, an unpaid order stayed open).
 *
 *  1. cancelBookingSet records ONE refund intent when something is owed.
 *  2. A replayed cancel does not write a second one (UNIQUE booking_id, 23505).
 *  3. Nothing owed (nothing paid) writes no intent.
 *  4. A missing intent table never turns an accepted cancel into a failure.
 *  5. Every cancel entry point settles the money around the cancelled booking.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { cancelBookingSet } from "./cancel-booking";

type Row = Record<string, unknown>;

function fakeAdmin(opts: { paid: Array<{ gross_amount_cents: number; status: string }>; intentError?: { code: string } | null }) {
  const intents: Row[] = [];
  const admin = {
    from(table: string) {
      if (table === "booking_refund_intents") {
        return {
          insert: async (row: Row) => {
            if (opts.intentError) return { data: null, error: opts.intentError };
            if (intents.some((r) => r.booking_id === row.booking_id)) return { data: null, error: { code: "23505" } };
            intents.push(row);
            return { data: null, error: null };
          },
        };
      }
      const rows: Row[] =
        table === "booking_transactions"
          ? opts.paid
          : table === "agency_bookings"
            ? [{ id: "b1", tenant_id: "t1", starts_at: "2099-01-01T10:00:00.000Z", order_id: "o1", source_inquiry_id: null, currency_code: "MXN" }]
            : [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
    rpc: async (fn: string) =>
      fn === "cancel_booking_set"
        ? { data: { ok: true, booking_id: "b1", order_id: "o1", by: "client" }, error: null }
        : { data: null, error: null },
  };
  return { admin, intents };
}

const input = {
  tenantId: "t1",
  bookingId: "b1",
  operationKey: "cancel-booking-1",
  reason: "changed plans",
  by: "client" as const,
  notify: () => {},
};

test("a cancel with money paid inside the free window opens one refund intent for the owed amount", async () => {
  const { admin, intents } = fakeAdmin({ paid: [{ gross_amount_cents: 30000, status: "paid" }] });
  const res = await cancelBookingSet(admin, input);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.refundableCents, 30000);
  assert.equal(intents.length, 1, "a refund intent exists");
  assert.equal(intents[0]!.booking_id, "b1");
  assert.equal(intents[0]!.order_id, "o1");
  assert.equal(intents[0]!.tenant_id, "t1");
  assert.equal(intents[0]!.refund_cents, 30000);
  assert.equal(intents[0]!.paid_cents, 30000);
});

test("a replayed cancel does not open a second refund intent", async () => {
  const { admin, intents } = fakeAdmin({ paid: [{ gross_amount_cents: 30000, status: "paid" }] });
  await cancelBookingSet(admin, input);
  const again = await cancelBookingSet(admin, input);
  assert.equal(again.ok, true);
  assert.equal(intents.length, 1);
});

test("nothing paid owes nothing: no refund intent", async () => {
  const { admin, intents } = fakeAdmin({ paid: [{ gross_amount_cents: 30000, status: "payment_requested" }] });
  const res = await cancelBookingSet(admin, input);
  assert.equal(res.ok, true);
  assert.equal(intents.length, 0);
});

test("an unavailable intent table never fails an accepted cancel, and says so in the result", async () => {
  const { admin, intents } = fakeAdmin({ paid: [{ gross_amount_cents: 30000, status: "paid" }], intentError: { code: "42P01" } });
  const res = await cancelBookingSet(admin, input);
  assert.equal(res.ok, true, "the cancel stands");
  assert.equal(intents.length, 0);
  if (res.ok) assert.equal(res.refundIntent, "unavailable");
});

test("every cancel entry point settles the money (pay links, unpaid order) after the cancel", () => {
  const root = join(process.cwd(), "src");
  const engine = readFileSync(join(root, "lib/server-actions/scheduling-engine.ts"), "utf8");
  const sheets = readFileSync(join(root, "lib/server-actions/messaging-sheets.ts"), "utf8");
  const client = readFileSync(join(root, "lib/client-account/booking-actions.ts"), "utf8");
  const agenda = readFileSync(join(root, "lib/talent-agenda/cancel-actions.ts"), "utf8");

  const fn = (src: string, name: string) => {
    const i = src.indexOf(`function ${name}`);
    assert.ok(i >= 0, `${name} exists`);
    const next = src.indexOf("\nexport async function", i + 10);
    return src.slice(i, next < 0 ? undefined : next);
  };
  const settles = /settleMoneyOnCancel|settleCancelledBookingMoney/;
  assert.match(fn(engine, "cancelBookingSetAction"), settles, "staff desk cancel");
  assert.match(fn(engine, "cancelBookingByManageToken"), settles, "manage-token cancel");
  assert.match(fn(sheets, "messagingCancelBooking"), settles, "messages cancel");
  assert.match(fn(client, "cancelMyBooking"), settles, "client account cancel");
  assert.match(fn(agenda, "cancelBookingWithRefund"), settles, "talent agenda cancel");
});
