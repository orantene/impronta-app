import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideOrderExpiry,
  idsToCancel,
  orderIdsWithPaidBooking,
  sweepExpiredOrders,
  IDLE_DRAFT_TTL_HOURS,
  type ExpiringOrder,
} from "@/lib/orders/expire-orders";

const NOW = new Date("2026-09-03T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const ahead = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function order(over: Partial<ExpiringOrder> = {}): ExpiringOrder {
  return {
    id: "o1",
    status: "pending_payment",
    holdExpiresAt: null,
    createdAt: ago(60_000),
    updatedAt: null,
    ...over,
  };
}

test("a lapsed hold is cancelled — it is denying a real seat", () => {
  const d = decideOrderExpiry(order({ holdExpiresAt: ago(1_000) }), NOW);
  assert.deepEqual(d, { action: "cancel", reason: "hold_lapsed" });
});

test("a live hold is kept", () => {
  const d = decideOrderExpiry(order({ holdExpiresAt: ahead(60_000) }), NOW);
  assert.equal(d.action, "keep");
});

test("pending_payment with NO hold is left alone", () => {
  // Nothing is being denied to anyone, and cancelling a payment someone may
  // still be completing is worse than a stale row.
  const d = decideOrderExpiry(order({ holdExpiresAt: null, createdAt: ago(30 * 86_400_000) }), NOW);
  assert.deepEqual(d, { action: "keep", reason: "not_expirable" });
});

test("a PAID order is never swept, even with a lapsed hold", () => {
  // commit_capacity refuses an expired hold, so "money landed, hold lapsed" is
  // a real branch. The answer is an alert for a human, never cancelling a paid
  // order.
  for (const status of ["paid", "fulfilled", "refunded", "partially_refunded", "cancelled"]) {
    const d = decideOrderExpiry(order({ status, holdExpiresAt: ago(86_400_000) }), NOW);
    assert.equal(d.action, "keep", `${status} must never be swept`);
  }
});

test("an idle draft is cancelled only after the long fuse", () => {
  const stale = decideOrderExpiry(
    order({ status: "draft", createdAt: ago((IDLE_DRAFT_TTL_HOURS + 1) * 3_600_000) }),
    NOW,
  );
  assert.deepEqual(stale, { action: "cancel", reason: "draft_abandoned" });

  const fresh = decideOrderExpiry(
    order({ status: "draft", createdAt: ago((IDLE_DRAFT_TTL_HOURS - 1) * 3_600_000) }),
    NOW,
  );
  assert.equal(fresh.action, "keep");
});

test("draft age is measured from the LAST TOUCH, not creation", () => {
  // A cart someone is still adding to is not abandoned, however long ago they
  // started it.
  const d = decideOrderExpiry(
    order({
      status: "draft",
      createdAt: ago(30 * 86_400_000),
      updatedAt: ago(60_000),
    }),
    NOW,
  );
  assert.equal(d.action, "keep", "a cart touched a minute ago is not abandoned");
});

test("the held fuse is much shorter than the idle fuse — the whole point", () => {
  const heldStale = decideOrderExpiry(order({ holdExpiresAt: ago(1_000) }), NOW);
  const draftSameAge = decideOrderExpiry(
    order({ status: "draft", createdAt: ago(16 * 60_000), updatedAt: ago(16 * 60_000) }),
    NOW,
  );
  assert.equal(heldStale.action, "cancel");
  assert.equal(draftSameAge.action, "keep");
});

test("an unparseable timestamp keeps the order rather than guessing", () => {
  assert.equal(decideOrderExpiry(order({ holdExpiresAt: "not-a-date" }), NOW).action, "keep");
  assert.equal(
    decideOrderExpiry(order({ status: "draft", createdAt: "nonsense", updatedAt: null }), NOW).action,
    "keep",
  );
});

test("the sweeper cancels only the rows the decision says to cancel", () => {
  const ids = idsToCancel(
    [
      order({ id: "hold", holdExpiresAt: ago(1_000) }),
      order({ id: "live", holdExpiresAt: ahead(60_000) }),
      order({ id: "paid", status: "paid", holdExpiresAt: ago(1_000) }),
    ],
    NOW,
  );
  assert.deepEqual(ids, ["hold"]);
});

test("sweep cancels the unpaid confirmed booking of a cancelled order, so the slot returns", async () => {
  const writes: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const orderRows = [{ id: "o1", status: "pending_payment", hold_expires_at: ago(1_000), created_at: ago(9e5), updated_at: null }];
  const admin = {
    from(table: string) {
      return {
        select() {
          const st = { in: false, limit: false, notNull: false };
          const chain = {
            eq: () => chain,
            not: () => {
              st.notNull = true;
              return chain;
            },
            limit: () => Promise.resolve({ data: [{ id: "ab1", order_id: "o1" }], error: null }),
            in: () => {
              st.in = true;
              const data =
                table === "orders" && orderRows.length && !st.notNull
                  ? [{ id: "o1", status: "pending_payment", hold_expires_at: ago(1_000), created_at: ago(9e5), updated_at: null }]
                  : table === "agency_bookings"
                    ? [{ id: "ab1", source_inquiry_id: "inq1" }]
                    : [];
              return Promise.resolve({ data, error: null });
            },
          };
          return chain;
        },
        update(payload: Record<string, unknown>) {
          writes.push({ table, payload });
          const done = { error: null, then: (f: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(f) };
          const chain = { eq: () => chain, in: () => ({ ...done, in: () => Promise.resolve({ error: null }) }) };
          return chain;
        },
      };
    },
  } as unknown as Parameters<typeof sweepExpiredOrders>[0];
  const res = await sweepExpiredOrders(admin, NOW);
  assert.equal(res.cancelled, 1);
  assert.equal(res.bookingsReleased, 1);
  assert.ok(writes.some((w) => w.table === "talent_bookings" && w.payload.status === "cancelled"));
  assert.ok(writes.some((w) => w.table === "agency_bookings" && w.payload.status === "cancelled"));
});

// TUL-1218: cash recorded from the Money page pays the BOOKING and leaves its order a draft;
// the 72 h idle-draft sweep then cancelled a paid sale's order (booking 9e8a3836 on prod).
const IDLE_MS = (IDLE_DRAFT_TTL_HOURS + 8) * 3_600_000;

function guardedSweepAdmin(opts: { paidOrderIds: string[]; paidReadError?: boolean }) {
  const cancelledIds: string[][] = [];
  const draft = (id: string) => ({ id, status: "draft", hold_expires_at: null, created_at: ago(IDLE_MS), updated_at: ago(IDLE_MS) });
  const orderRows = [draft("o_paid"), draft("o_unpaid")];
  const bookings = {
    select() {
      const chain = {
        eq: () => chain,
        not: () => chain,
        // the release-orphans read: nothing to release
        limit: () => Promise.resolve({ data: [], error: null }),
        // the paid-booking guard read
        in: () =>
          Promise.resolve(
            opts.paidReadError
              ? { data: null, error: { message: "boom" } }
              : { data: opts.paidOrderIds.map((order_id) => ({ order_id })), error: null },
          ),
      };
      return chain;
    },
  };
  const orders = {
    select: () => ({ in: () => Promise.resolve({ data: orderRows, error: null }) }),
    update: () => ({
      in: (_col: string, ids: string[]) => {
        cancelledIds.push(ids);
        return { in: () => Promise.resolve({ error: null }) };
      },
    }),
  };
  const admin = {
    from: (table: string) => (table === "orders" ? orders : bookings),
  } as unknown as Parameters<typeof sweepExpiredOrders>[0];
  return { admin, cancelledIds };
}

test("TUL-1218: an idle draft whose booking is already paid is kept; an unpaid one is still cancelled", async () => {
  const { admin, cancelledIds } = guardedSweepAdmin({ paidOrderIds: ["o_paid"] });
  const res = await sweepExpiredOrders(admin, NOW);
  assert.deepEqual(cancelledIds, [["o_unpaid"]]);
  assert.equal(res.cancelled, 1);
  assert.equal(res.keptForPayment, 1);
});

test("TUL-1218: if the paid-booking read fails, nothing is cancelled (fail closed)", async () => {
  const { admin, cancelledIds } = guardedSweepAdmin({ paidOrderIds: [], paidReadError: true });
  const res = await sweepExpiredOrders(admin, NOW);
  assert.deepEqual(cancelledIds, []);
  assert.equal(res.cancelled, 0);
});

test("TUL-1218: orderIdsWithPaidBooking returns the paid ones, null on a read error, empty without a read for no ids", async () => {
  const ok = guardedSweepAdmin({ paidOrderIds: ["a", "b"] }).admin;
  assert.deepEqual([...(await orderIdsWithPaidBooking(ok, ["a", "b", "c"]))!].sort(), ["a", "b"]);
  const bad = guardedSweepAdmin({ paidOrderIds: [], paidReadError: true }).admin;
  assert.equal(await orderIdsWithPaidBooking(bad, ["a"]), null);
  const never = { from: () => { throw new Error("must not read"); } } as unknown as Parameters<typeof sweepExpiredOrders>[0];
  assert.equal((await orderIdsWithPaidBooking(never, [])).size, 0);
});
