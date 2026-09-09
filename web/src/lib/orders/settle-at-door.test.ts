import { test } from "node:test";
import assert from "node:assert/strict";
import { settleAtDoor } from "./settle-at-door";

type Row = Record<string, unknown>;

function fake(opts: {
  order?: Row | null;
  existingTxn?: { id: string } | null;
  insertId?: string;
  /** A booking already attached to this order, so the shell is found not made. */
  existingBooking?: { id: string } | null;
  /** The shell insert fails with this, to prove no money is then recorded. */
  bookingInsertError?: { code?: string } | null;
}) {
  const inserts: Row[] = [];
  const updates: Row[] = [];
  // `orders` is read twice on the happy path: once by settleAtDoor and once by
  // completeOrderForTransaction. Returning `paid` on the second read is the
  // real "another worker settled it first" state, and it keeps this test on
  // the write shape instead of re-testing allocation, which complete-order.test
  // already covers.
  let orderReads = 0;
  const from = (table: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      insert: (payload: Row) => {
        inserts.push({ table, ...payload });
        return api;
      },
      // `update` terminates on `.eq()`, which returns the awaited builder. The
      // real client resolves there, so `eq` has to be thenable rather than
      // only chainable.
      update: (payload: Row) => {
        updates.push({ table, ...payload });
        return { eq: async () => ({ data: null, error: null }) };
      },
      maybeSingle: async () => {
        if (table === "orders") {
          orderReads += 1;
          if (!opts.order) return { data: null, error: null };
          if (orderReads > 1) return { data: { ...opts.order, status: "paid" }, error: null };
          return { data: opts.order, error: null };
        }
        if (table === "booking_transactions") {
          // The prior-settlement probe, then completeOrder's read-back of the
          // row just inserted, which must carry the order for it to proceed.
          const inserted = inserts.find((i) => i.table === "booking_transactions");
          if (inserted) {
            return { data: { id: opts.insertId ?? "txn-new", order_id: inserted.order_id }, error: null };
          }
          return { data: opts.existingTxn ?? null, error: null };
        }
        if (table === "agency_bookings") return { data: opts.existingBooking ?? null, error: null };
        return { data: null, error: null };
      },
      // Checked here rather than on the object `insert` returns, because the
      // real chain is `.insert().select().single()` and `select` hands back the
      // shared builder — an override attached at `insert` would be dropped.
      single: async () => {
        if (table === "agency_bookings" && opts.bookingInsertError) {
          return { data: null, error: opts.bookingInsertError };
        }
        return {
          data: { id: table === "agency_bookings" ? "bk-new" : (opts.insertId ?? "txn-new") },
          error: null,
        };
      },
    };
    return api;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { inserts, updates, admin: { from, rpc: async () => ({ data: null, error: null }) } as any };
}

/** The statuses a run walked a transaction through, in order. */
const walk = (updates: Row[]) =>
  updates.filter((u) => u.table === "booking_transactions").map((u) => u.status);

const HELD = { id: "o1", tenant_id: "t1", status: "pending_payment", total_cents: 1800 };

test("refuses a negative amount before any write", async () => {
  const { inserts, admin } = fake({ order: { id: "o1", tenant_id: "t1", status: "pending_payment", total_cents: 1000 } });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "o1", actorUserId: "u1", paidVia: "cash",
    amountCents: -1, currency: "usd", idempotencyKey: "door-1",
  });
  assert.equal(!r.ok && r.reason, "amount");
  assert.equal(inserts.length, 0);
});

test("refuses another workspace's order", async () => {
  const { admin } = fake({ order: { id: "o1", tenant_id: "other", status: "pending_payment", total_cents: 1000 } });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "o1", actorUserId: "u1", paidVia: "cash",
    amountCents: 1000, currency: "usd", idempotencyKey: "door-1",
  });
  assert.equal(!r.ok && r.reason, "wrong_tenant");
});

test("a missing order is not_found, not a write", async () => {
  const { admin } = fake({ order: null });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "missing", actorUserId: "u1", paidVia: "card",
    amountCents: 1000, currency: "usd", idempotencyKey: "door-1",
  });
  assert.equal(!r.ok && r.reason, "not_found");
});

test("the transaction carries a booking, because the scope trigger refuses one without", async () => {
  // THE DEFECT. This path had no happy-path test at all — only the three
  // refusals above — so nothing noticed that it inserted
  // `booking_transactions` with no `booking_id`.
  // `trg_booking_transactions_scope` raises on that, collection came back
  // "Could not record the cash.", and a cashier could take an $18 note while
  // the order stayed unpaid with the whole amount still outstanding.
  const { inserts, updates, admin } = fake({ order: HELD });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "o1", actorUserId: "u1", paidVia: "cash",
    amountCents: 1800, currency: "usd", idempotencyKey: "door-1",
    contact: { email: "walkin@example.test" },
  });
  assert.equal(r.ok, true);

  const shell = inserts.find((i) => i.table === "agency_bookings");
  assert.ok(shell, "a booking shell must be created for the money to hang off");
  assert.equal(shell.order_id, "o1", "and it must belong to this order");
  assert.equal(shell.contact_email, "walkin@example.test", "the till's buyer is stamped on it");

  const txn = inserts.find((i) => i.table === "booking_transactions");
  assert.ok(txn);
  assert.equal(txn.booking_id, "bk-new", "the transaction names the shell");
  assert.equal(txn.gross_amount_cents, 1800);

  // Inserted as draft and walked, because the state machine allows no other
  // initial status and has no draft → paid edge. Inserting `paid` outright is
  // what raised `initial status must be draft` on every door settlement.
  assert.equal(txn.status, "draft", "the only legal initial status");
  assert.deepEqual(walk(updates), ["payment_requested", "paid"], "and then the legal path to paid");
  assert.equal(txn.paid_at, undefined, "the trigger stamps paid_at on entry, not the caller");
  assert.equal(txn.provider, "manual", "the off-platform rail, which needs no payout receiver");
  assert.equal(txn.payout_receiver_id, undefined, "cash in a drawer has no payout destination");
});

test("an order that already has a booking settles onto it instead of minting a second", async () => {
  // Find-or-create, not create. A split tab and a re-run card are two calls on
  // one sale, and a second shell is that sale counted twice everywhere
  // bookings are listed or summed.
  const { inserts, admin } = fake({ order: HELD, existingBooking: { id: "bk-existing" } });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "o1", actorUserId: "u1", paidVia: "cash",
    amountCents: 900, currency: "usd", idempotencyKey: "door-2",
  });
  assert.equal(r.ok, true, "reusing a shell is not a refusal");
  assert.equal(
    inserts.filter((i) => i.table === "agency_bookings").length,
    0,
    "the existing shell is reused",
  );
  assert.equal(inserts.find((i) => i.table === "booking_transactions")?.booking_id, "bk-existing");
});

test("a retry finishes a walk that died half-way instead of completing on top of it", async () => {
  // Recording cash takes two updates, so a process that dies between them
  // leaves the row at `payment_requested`. The idempotency key finds it again —
  // and the retry has to finish the walk, because completing the ORDER while
  // its own money row still says the cash was not received is the false-paid
  // state inverted.
  const { updates, admin } = fake({
    order: HELD,
    existingTxn: { id: "txn-half", status: "payment_requested", order_id: "o1" } as never,
  });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "o1", actorUserId: "u1", paidVia: "cash",
    amountCents: 1800, currency: "usd", idempotencyKey: "door-1",
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.alreadySettled, true, "reported as a resume, not a fresh settlement");
  assert.deepEqual(
    walk(updates),
    ["paid"],
    "only the missing step is re-issued: the graph refuses paid → payment_requested",
  );
});

test("if the shell cannot be made, no money is recorded against nothing", async () => {
  // The insert would be refused by the trigger anyway. Stopping first is what
  // makes the failure a clean "could not record" rather than a raised
  // exception mid-settlement.
  const { inserts, admin } = fake({ order: HELD, bookingInsertError: { code: "42501" } });
  const r = await settleAtDoor(admin, {
    tenantId: "t1", orderId: "o1", actorUserId: "u1", paidVia: "cash",
    amountCents: 1800, currency: "usd", idempotencyKey: "door-3",
  });
  assert.equal(!r.ok && r.reason, "unavailable");
  assert.equal(
    inserts.filter((i) => i.table === "booking_transactions").length,
    0,
    "no transaction without a booking",
  );
});
