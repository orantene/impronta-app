/**
 * TUL-1268 item 3: every cancel entry point notifies through ONE hook, once,
 * and the notice never changes what is charged, stored or refunded.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cancelBookingSet } from "./cancel-booking";
import { notifyBookingSetCancelled, type BookingSetCancelledNotice } from "./cancel-notify";
import { buildBookingCancelledEvent } from "@/lib/notifications/producers/booking-cancelled-notify";

type Txn = { gross_amount_cents: number; status: string };

function fakeAdmin(opts: { txns?: Txn[]; txnError?: boolean; already?: boolean; inquiry?: string | null }) {
  const reads: string[] = [];
  const writes: string[] = [];
  const booking = {
    id: "b1",
    tenant_id: "t1",
    starts_at: "2099-01-01T10:00:00.000Z",
    order_id: "o1",
    source_inquiry_id: opts.inquiry === undefined ? "inq-1" : opts.inquiry,
    currency_code: "MXN",
  };
  const make = (table: string) => {
    reads.push(table);
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "not", "neq", "gte", "lte", "order", "limit"]) chain[m] = () => chain;
    for (const m of ["insert", "update", "upsert", "delete"]) {
      chain[m] = () => {
        writes.push(`${table}.${m}`);
        return chain;
      };
    }
    chain.maybeSingle = async () => ({ data: table === "agency_bookings" ? booking : null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve(
        table === "booking_transactions"
          ? opts.txnError
            ? { data: null, error: { message: "boom" } }
            : { data: opts.txns ?? [], error: null }
          : { data: [], error: null },
      );
    return chain;
  };
  return {
    reads,
    writes,
    admin: {
      from: make,
      rpc: async () => ({
        data: { ok: true, booking_id: "b1", order_id: "o1", already: opts.already === true },
        error: null,
      }),
    },
  };
}

const base = { tenantId: "t1", bookingId: "b1", operationKey: "cancel-op-12345", reason: "changed" } as const;

for (const by of ["staff", "client", "customer", "talent", "system"] as const) {
  test(`cancel by ${by} calls the notify hook exactly once with the refund facts`, async () => {
    const { admin } = fakeAdmin({ txns: [{ gross_amount_cents: 5000, status: "paid" }] });
    const calls: BookingSetCancelledNotice[] = [];
    const res = await cancelBookingSet(admin, { ...base, by, notify: (n) => void calls.push(n) });
    assert.equal(res.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.tenantId, "t1");
    assert.equal(calls[0]!.bookingId, "b1");
    assert.equal(calls[0]!.inquiryId, "inq-1");
    assert.equal(calls[0]!.paidCents, 5000);
    assert.equal(calls[0]!.currency, "MXN");
    assert.equal(calls[0]!.by, by === "customer" ? "client" : by);
  });
}

test("a replayed cancel does not notify again", async () => {
  const { admin } = fakeAdmin({ already: true });
  const calls: BookingSetCancelledNotice[] = [];
  await cancelBookingSet(admin, { ...base, by: "staff", notify: (n) => void calls.push(n) });
  assert.equal(calls.length, 0);
});

test("a failed paid-amount read still tells everyone, with no amounts", async () => {
  const { admin } = fakeAdmin({ txnError: true });
  const calls: BookingSetCancelledNotice[] = [];
  const res = await cancelBookingSet(admin, { ...base, by: "client", notify: (n) => void calls.push(n) });
  assert.equal(res.ok, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.paidCents, null);
  assert.equal(calls[0]!.refundableCents, null);
});

test("amounts unchanged: the result and every table touched are identical with and without the hook", async () => {
  const txns = [{ gross_amount_cents: 7300, status: "paid" }];
  const a = fakeAdmin({ txns });
  const b = fakeAdmin({ txns });
  const withHook = await cancelBookingSet(a.admin, { ...base, by: "staff", nowMs: 1, notify: () => {} });
  const quiet = await cancelBookingSet(b.admin, { ...base, by: "staff", nowMs: 1, notify: () => {} });
  assert.deepEqual(withHook, quiet);
  assert.equal(withHook.ok && withHook.refundableCents, 7300);
  assert.deepEqual(a.writes, [], "the notice writes nothing to money or booking tables");
  assert.deepEqual(a.reads, b.reads);
});

test("a booking with no source inquiry is skipped by the real hook without throwing", () => {
  assert.doesNotThrow(() =>
    notifyBookingSetCancelled({
      tenantId: "t1",
      bookingId: "b1",
      inquiryId: null,
      paidCents: 0,
      refundableCents: 0,
      currency: "MXN",
      by: "staff",
    }),
  );
});

test("the event carries one stable id per booking and the refund facts", () => {
  const e = buildBookingCancelledEvent({
    tenantId: "t1",
    inquiryId: "inq-1",
    bookingId: "b1",
    extra: { paidCents: 5000, refundCents: 2500, currency: "MXN", cancelledBy: "client" },
  });
  assert.equal(e.type, "booking.cancelled");
  assert.equal(e.eventId, "booking-cancelled:b1");
  assert.equal(e.payload.refundCents, 2500);
  assert.equal(e.payload.bookingId, "b1");
});

test("every entry point funnels through cancelBookingSet and none sends its own cancel notice", () => {
  const files = [
    "src/lib/server-actions/scheduling-engine.ts", // staff desk + /manage token link
    "src/lib/client-account/booking-actions.ts", // /account
    "src/lib/talent-agenda/cancel-actions.ts", // talent agenda
    "src/lib/server-actions/messaging-sheets.ts", // messaging change sheet
  ];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.match(src, /cancelBookingSet\(/, `${f} must use the funnel`);
    assert.doesNotMatch(src, /notifyBookingCancelled\(|booking\.cancelled/, `${f} must not notify on its own`);
  }
  const funnel = readFileSync(join(process.cwd(), "src/lib/scheduling/cancel-booking.ts"), "utf8");
  assert.equal(funnel.split("notify({").length - 1, 1, "exactly one notify call site in the funnel");
});
