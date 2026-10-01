import { test } from "node:test";
import assert from "node:assert/strict";
import { ledgerPaidCents, settleMoneyOnCancel, type CancelPaymentLinkFn } from "./cancel-money";
import { moneyStore } from "./__fixtures__/money-store";

/** Stands in for `cancelPaymentLink`: flips the link, as the real one does after expiring its session. */
function fakeCancelLink(opts: { completed?: string[] } = {}) {
  const calls: string[] = [];
  const fn: CancelPaymentLinkFn = async (admin, input) => {
    calls.push(input.linkId);
    if (opts.completed?.includes(input.linkId)) return { ok: false, reason: "already_paid" };
    const { data } = await admin.from("payment_links").select("status").eq("id", input.linkId).maybeSingle();
    if (data?.status !== "open") return { ok: true, already: true };
    await admin.from("payment_links").update({ status: "cancelled" }).eq("id", input.linkId);
    return { ok: true, already: false };
  };
  return { fn, calls };
}

function jorStore(txns: Array<{ status: string; gross_amount_cents: number }> = []) {
  return moneyStore({
    orders: [{ id: "o1", tenant_id: "t1", status: "pending_payment" }],
    payment_links: [
      { id: "l1", tenant_id: "t1", order_id: "o1", status: "open" },
      { id: "l2", tenant_id: "t1", order_id: "o1", status: "replaced" },
    ],
    booking_transactions: txns.map((t, i) => ({ id: `x${i}`, order_id: "o1", ...t })),
  });
}

test("unpaid cancel voids the order and takes down every open pay link", async () => {
  const store = jorStore([{ status: "payment_requested", gross_amount_cents: 30000 }]);
  const link = fakeCancelLink();
  const out = await settleMoneyOnCancel(store.admin, { tenantId: "t1", orderId: "o1" }, { cancelPaymentLink: link.fn });
  assert.equal(out.ok, true);
  assert.equal(out.paidCents, 0);
  assert.equal(out.linksVoided, 1);
  assert.equal(out.orderVoided, true);
  assert.deepEqual(link.calls, ["l1"], "only the open link is cancelled");
  assert.equal(store.tables.orders[0]!.status, "cancelled");
  assert.equal(store.tables.payment_links[0]!.status, "cancelled");
});

test("paid cancel keeps the order, reports the ledger amount, still closes open links", async () => {
  const store = jorStore([
    { status: "paid", gross_amount_cents: 30000 },
    { status: "failed", gross_amount_cents: 30000 },
  ]);
  const link = fakeCancelLink();
  const out = await settleMoneyOnCancel(store.admin, { tenantId: "t1", orderId: "o1" }, { cancelPaymentLink: link.fn });
  assert.equal(out.paidCents, 30000);
  assert.equal(out.orderVoided, false);
  assert.equal(store.tables.orders[0]!.status, "pending_payment");
  assert.equal(store.tables.payment_links[0]!.status, "cancelled");
});

test("a session that completed during the cancel is money in flight: the order is not voided", async () => {
  const store = jorStore();
  const link = fakeCancelLink({ completed: ["l1"] });
  const out = await settleMoneyOnCancel(store.admin, { tenantId: "t1", orderId: "o1" }, { cancelPaymentLink: link.fn });
  assert.equal(out.paymentInFlight, true);
  assert.equal(out.orderVoided, false);
  assert.equal(store.tables.orders[0]!.status, "pending_payment");
});

test("cancel money step is idempotent: a second run writes nothing", async () => {
  const store = jorStore();
  const link = fakeCancelLink();
  await settleMoneyOnCancel(store.admin, { tenantId: "t1", orderId: "o1" }, { cancelPaymentLink: link.fn });
  const before = store.writes.length;
  const again = await settleMoneyOnCancel(store.admin, { tenantId: "t1", orderId: "o1" }, { cancelPaymentLink: link.fn });
  assert.equal(again.ok, true);
  assert.equal(again.linksVoided, 0);
  assert.equal(again.orderVoided, false);
  assert.equal(store.writes.filter((w) => w.ids.length > 0).length, store.writes.slice(0, before).filter((w) => w.ids.length > 0).length);
  assert.equal(store.tables.orders[0]!.status, "cancelled");
});

test("a booking with no order has nothing to settle", async () => {
  const store = jorStore();
  const link = fakeCancelLink();
  const out = await settleMoneyOnCancel(store.admin, { tenantId: "t1", orderId: null }, { cancelPaymentLink: link.fn });
  assert.deepEqual(out, { ok: true, paidCents: 0, linksVoided: 0, paymentInFlight: false, orderVoided: false });
  assert.equal(link.calls.length, 0);
});

test("ledger paid counts paid and payout states only", async () => {
  const store = jorStore([
    { status: "paid", gross_amount_cents: 100 },
    { status: "payout_sent", gross_amount_cents: 200 },
    { status: "payment_requested", gross_amount_cents: 400 },
    { status: "refunded", gross_amount_cents: 800 },
  ]);
  assert.equal(await ledgerPaidCents(store.admin, "o1"), 300);
  assert.equal(await ledgerPaidCents(store.admin, null), 0);
});

test("an unreadable ledger never voids the order", async () => {
  const store = jorStore();
  const broken = {
    from(table: string) {
      if (table === "booking_transactions") {
        const q = { select: () => q, eq: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve(r({ data: null, error: { message: "down" } })) };
        return q;
      }
      return store.admin.from(table);
    },
  };
  const out = await settleMoneyOnCancel(broken, { tenantId: "t1", orderId: "o1" }, { cancelPaymentLink: fakeCancelLink().fn });
  assert.equal(out.ok, false);
  assert.equal(store.tables.orders[0]!.status, "pending_payment");
});
