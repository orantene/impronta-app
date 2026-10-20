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
 *
 * Review fixes (PR #4199, TUL-1454):
 *  6. Paid = the shared ledger rule (`ledgerPaidCents`: paid, payout_pending,
 *     payout_sent), so a booking whose payout is queued or sent still owes.
 *  7. No currency, no intent (fail closed); the column is NOT NULL.
 *  8. A replay reuses the stored intent: same amount, no second row, and never
 *     a fresh intent from a recompute at replay time.
 *  9. Money already refunded by hand is netted out of what is owed.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { cancelBookingSet } from "./cancel-booking";

type Row = Record<string, unknown>;
type Txn = { id?: string; gross_amount_cents: number; status: string; refund_of_transaction_id?: string | null };

function fakeAdmin(opts: {
  paid: Txn[];
  intentError?: { code: string } | null;
  currency?: string | null;
  /** The cancel RPC answers `already` from this call on (1-based). */
  alreadyFromCall?: number;
}) {
  const intents: Row[] = [];
  let rpcCalls = 0;
  const state = { paid: opts.paid, intentError: opts.intentError ?? null };
  const admin = {
    from(table: string) {
      if (table === "booking_refund_intents") {
        const read: Record<string, unknown> = {
          select: () => read,
          eq: () => read,
          maybeSingle: async () =>
            state.intentError ? { data: null, error: state.intentError } : { data: intents[0] ?? null, error: null },
        };
        return {
          ...read,
          insert: async (row: Row) => {
            if (state.intentError) return { data: null, error: state.intentError };
            if (intents.some((r) => r.booking_id === row.booking_id)) return { data: null, error: { code: "23505" } };
            intents.push(row);
            return { data: null, error: null };
          },
        };
      }
      const rows: Row[] =
        table === "booking_transactions"
          ? state.paid
          : table === "agency_bookings"
            ? [
                {
                  id: "b1",
                  tenant_id: "t1",
                  starts_at: "2099-01-01T10:00:00.000Z",
                  order_id: "o1",
                  source_inquiry_id: null,
                  currency_code: opts.currency === undefined ? "MXN" : opts.currency,
                },
              ]
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
    rpc: async (fn: string) => {
      if (fn !== "cancel_booking_set") return { data: null, error: null };
      rpcCalls += 1;
      const already = opts.alreadyFromCall != null && rpcCalls >= opts.alreadyFromCall;
      return { data: { ok: true, booking_id: "b1", order_id: "o1", by: "client", already }, error: null };
    },
  };
  return { admin, intents, state };
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
  const { admin, intents } = fakeAdmin({ paid: [{ gross_amount_cents: 30000, status: "paid" }], alreadyFromCall: 2 });
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

for (const status of ["payout_pending", "payout_sent"] as const) {
  test(`a booking whose payout is ${status} still opens its refund intent (shared ledger rule)`, async () => {
    const { admin, intents } = fakeAdmin({ paid: [{ id: "tx1", gross_amount_cents: 30000, status }] });
    const res = await cancelBookingSet(admin, input);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.refundableCents, 30000);
    assert.equal(intents.length, 1);
    assert.equal(intents[0]!.refund_cents, 30000);
    assert.equal(intents[0]!.paid_cents, 30000);
  });
}

test("no currency on the booking: no intent is written (fail closed), the cancel stands", async () => {
  const { admin, intents } = fakeAdmin({ paid: [{ id: "tx1", gross_amount_cents: 30000, status: "paid" }], currency: null });
  const res = await cancelBookingSet(admin, input);
  assert.equal(res.ok, true, "the cancel stands");
  assert.equal(intents.length, 0, "no intent without a currency");
  if (res.ok) assert.equal(res.refundIntent, "no_currency");
});

test("an intent always carries its currency", async () => {
  const { admin, intents } = fakeAdmin({ paid: [{ id: "tx1", gross_amount_cents: 30000, status: "paid" }] });
  await cancelBookingSet(admin, input);
  assert.equal(intents[0]!.currency_code, "MXN");
});

test("a replay reuses the stored intent: same amount, no second intent, even if the ledger moved", async () => {
  const { admin, intents, state } = fakeAdmin({
    paid: [{ id: "tx1", gross_amount_cents: 30000, status: "paid" }],
    alreadyFromCall: 2,
  });
  const first = await cancelBookingSet(admin, input);
  assert.equal(first.ok && first.refundableCents, 30000);
  // Between the cancel and its replay another charge settled; a recompute at
  // replay time would owe 50000.
  state.paid = [
    { id: "tx1", gross_amount_cents: 30000, status: "paid" },
    { id: "tx2", gross_amount_cents: 20000, status: "paid" },
  ];
  const again = await cancelBookingSet(admin, input);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(intents.length, 1, "no second intent");
  assert.equal(again.refundableCents, 30000, "the amount stored at cancel time");
  assert.equal(again.refundIntent, "already");
});

test("a replay with no stored intent never opens one from a recompute at replay time", async () => {
  const { admin, intents, state } = fakeAdmin({
    paid: [{ id: "tx1", gross_amount_cents: 30000, status: "paid" }],
    intentError: { code: "42P01" },
    alreadyFromCall: 2,
  });
  const first = await cancelBookingSet(admin, input);
  assert.equal(first.ok && first.refundIntent, "unavailable");
  state.intentError = null; // the table lands between the cancel and the replay
  const again = await cancelBookingSet(admin, input);
  assert.equal(again.ok, true);
  assert.equal(intents.length, 0, "a stale replay-time amount is never recorded");
  if (again.ok) assert.equal(again.refundIntent, "unavailable");
});

test("money already refunded by hand is netted out of the owed amount", async () => {
  const { admin, intents } = fakeAdmin({
    paid: [
      { id: "tx1", gross_amount_cents: 30000, status: "paid", refund_of_transaction_id: null },
      { id: "rf1", gross_amount_cents: 10000, status: "refunded", refund_of_transaction_id: "tx1" },
    ],
  });
  const res = await cancelBookingSet(admin, input);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.refundableCents, 20000);
  assert.equal(intents.length, 1);
  assert.equal(intents[0]!.refund_cents, 20000);
});

test("a charge refunded in full by hand owes nothing: no intent", async () => {
  const { admin, intents } = fakeAdmin({
    paid: [
      { id: "tx1", gross_amount_cents: 30000, status: "refunded", refund_of_transaction_id: null },
      { id: "rf1", gross_amount_cents: 30000, status: "refunded", refund_of_transaction_id: "tx1" },
    ],
  });
  const res = await cancelBookingSet(admin, input);
  assert.equal(res.ok, true);
  assert.equal(intents.length, 0);
});

test("the held migration is version 20261231421300 and its currency is NOT NULL", () => {
  const dir = join(process.cwd(), "..", "supabase", "migrations", "_pending_pm");
  assert.equal(existsSync(join(dir, "20261231419200_booking_refund_intents.sql")), false, "419200 belongs to the service hub");
  const sql = readFileSync(join(dir, "20261231421300_booking_refund_intents.sql"), "utf8");
  assert.match(sql, /currency_code\s+text\s+NOT NULL/i);
});

test("guest cancel copy (EN + ES) never promises an automatic refund: nothing consumes the intent yet", () => {
  const read = (loc: string) =>
    JSON.parse(readFileSync(join(process.cwd(), "messages", `${loc}.json`), "utf8")) as {
      public: { manageBooking: Record<string, string>; clientAccountArea: Record<string, string> };
    };
  for (const loc of ["en", "es"]) {
    const m = read(loc);
    const lines = [
      m.public.manageBooking.cancelRefund,
      m.public.manageBooking.cancelledRefund,
      m.public.clientAccountArea.cancelledRefund,
    ];
    for (const line of lines) {
      assert.ok(typeof line === "string" && line.includes("{amount}"), `${loc}: keeps the amount`);
      assert.doesNotMatch(
        line,
        /comes back the way|on its way|vuelve por donde|en camino|once the bank confirms|en cuanto el banco/i,
        `${loc}: "${line}" promises an automatic refund`,
      );
      assert.match(line, /business|negocio/i, `${loc}: "${line}" says the business processes it`);
    }
  }
});
