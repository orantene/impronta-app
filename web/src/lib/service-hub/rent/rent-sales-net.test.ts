/** TUL-1702: the percentage base is NET of discount and refunds, and an order counts in the month it was PAID. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadMemberSalesBase } from "./rent-sales-base.server";
import { netSalesCents, ordersPaidInWindow } from "./rent-sales-net";

const ME = "tp-me";
const L = (id: string, orderId: string, who: string, totalCents: number, refundedCents = 0) => ({ id, orderId, talentProfileId: who, totalCents, refundedCents });

describe("net of discount and refunds", () => {
  test("a discounted order: the member's line carries its share of the order discount, not the gross", () => {
    // two lines 10,000 + 10,000, order discount 4,000 -> each line nets 8,000
    const lines = [L("a", "o1", ME, 10_000), L("b", "o1", "tp-other", 10_000)];
    assert.equal(netSalesCents({ orders: [{ id: "o1", discountCents: 4_000 }], lines, talentProfileId: ME }), 8_000);
  });
  test("refunds come off the NET line, never below zero", () => {
    const lines = [L("a", "o1", ME, 10_000, 3_000)];
    assert.equal(netSalesCents({ orders: [{ id: "o1", discountCents: 2_000 }], lines, talentProfileId: ME }), 5_000);
    assert.equal(netSalesCents({ orders: [{ id: "o1", discountCents: 2_000 }], lines: [L("a", "o1", ME, 10_000, 99_999)], talentProfileId: ME }), 0);
  });
  test("the discount divides with largest remainder: shares add up to exactly the discount (no cent invented)", () => {
    const lines = [L("a", "o1", ME, 100), L("b", "o1", ME, 100), L("c", "o1", ME, 100)];
    assert.equal(netSalesCents({ orders: [{ id: "o1", discountCents: 100 }], lines, talentProfileId: ME }), 200);
  });
  test("an order with none of the member's lines, and other members' lines, add nothing", () => {
    assert.equal(netSalesCents({ orders: [{ id: "o1", discountCents: 0 }], lines: [L("a", "o1", "tp-other", 5_000)], talentProfileId: ME }), 0);
  });
});

describe("a line's own discount (TUL-1702 P1)", () => {
  const withDisc = (id: string, orderId: string, who: string, total: number, discountCents: number) => ({ ...L(id, orderId, who, total), discountCents });
  test("the line's own discount comes off that line only; the order discount spreads only what is left", () => {
    // line a 10,000 with its own 1,000 off; line b 10,000 no own discount; order discount 3,000 in total
    // leftover = 3,000 - 1,000 = 2,000 spread over the after-own totals 9,000 and 10,000
    const lines = [withDisc("a", "o1", ME, 10_000, 1_000), withDisc("b", "o1", "tp-other", 10_000, 0)];
    const a = netSalesCents({ orders: [{ id: "o1", discountCents: 3_000 }], lines, talentProfileId: ME });
    assert.equal(a, 9_000 - Math.round((9_000 * 2_000) / 19_000)); // 9,000 - 947 = 8,053
    assert.equal(a, 8_053);
  });
  test("when the order discount is only the sum of the line discounts, nothing more is taken", () => {
    const lines = [withDisc("a", "o1", ME, 10_000, 1_000), withDisc("b", "o1", ME, 5_000, 500)];
    assert.equal(netSalesCents({ orders: [{ id: "o1", discountCents: 1_500 }], lines, talentProfileId: ME }), 13_500);
  });
  test("never below zero: a line discount larger than the line, or larger than the order discount", () => {
    assert.equal(netSalesCents({ orders: [{ id: "o1", discountCents: 100 }], lines: [withDisc("a", "o1", ME, 1_000, 5_000)], talentProfileId: ME }), 0);
    assert.equal(netSalesCents({ orders: [{ id: "o1", discountCents: 0 }], lines: [withDisc("a", "o1", ME, 1_000, 400)], talentProfileId: ME }), 600);
  });
});

describe("paid time, not created time", () => {
  const from = "2026-11-01T06:00:00.000Z";
  const to = "2026-12-01T06:00:00.000Z";
  test("an order paid in the month counts; one paid before or after does not; the FIRST payment decides", () => {
    const t = [
      { orderId: "in", paidAt: "2026-11-10T12:00:00Z" },
      { orderId: "late", paidAt: "2026-12-02T12:00:00Z" },
      { orderId: "early", paidAt: "2026-10-30T12:00:00Z" },
      { orderId: "early", paidAt: "2026-11-03T12:00:00Z" }, // second payment in November, first in October: October
    ];
    assert.deepEqual(ordersPaidInWindow(t, from, to), ["in"]);
  });
  test("the Mexico City boundary: 23:30 on Nov 30 local is November, 00:30 on Dec 1 local is December", () => {
    assert.deepEqual(ordersPaidInWindow([{ orderId: "a", paidAt: "2026-12-01T05:30:00Z" }, { orderId: "b", paidAt: "2026-12-01T06:30:00Z" }], from, to), ["a"]);
  });
});

/** A tiny in-memory PostgREST over three tables: select/eq/not/gte/lt/in/order/range. */
function fakeAdmin(tables: Record<string, Array<Record<string, unknown>>>, failTable?: string) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let lo = 0;
      let hi = Infinity;
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        not: (c: string) => ((rows = rows.filter((r) => r[c] != null)), q),
        gte: (c: string, v: string) => ((rows = rows.filter((r) => String(r[c]) >= v)), q),
        lt: (c: string, v: string) => ((rows = rows.filter((r) => String(r[c]) < v)), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        order: () => q,
        range: (a: number, b: number) => ((lo = a), (hi = b), q),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve(table === failTable ? { data: null, error: { message: "boom" } } : { data: rows.slice(lo, hi + 1), error: null }).then(res),
      });
      return q;
    },
  } as never;
}

describe("loadMemberSalesBase (fake database)", () => {
  const world = () => ({
    booking_transactions: [
      { id: "x1", source_tenant_id: "t", order_id: "o-nov", status: "paid", paid_at: "2026-11-05T12:00:00Z" },
      { id: "x2", source_tenant_id: "t", order_id: "o-oct-created", status: "paid", paid_at: "2026-11-02T12:00:00Z" }, // created in Oct, paid in Nov
      { id: "x3", source_tenant_id: "t", order_id: "o-dec", status: "paid", paid_at: "2026-12-04T12:00:00Z" },
    ],
    orders: [
      { id: "o-nov", tenant_id: "t", status: "paid", currency: "MXN", discount_cents: 2_000, source_page: null },
      { id: "o-oct-created", tenant_id: "t", status: "paid", currency: "MXN", discount_cents: 0, source_page: null },
      { id: "o-dec", tenant_id: "t", status: "paid", currency: "MXN", discount_cents: 0, source_page: null },
    ],
    order_lines: [
      { id: "l1", tenant_id: "t", order_id: "o-nov", talent_profile_id: ME, total_cents: 10_000, refunded_cents: 0 },
      { id: "l2", tenant_id: "t", order_id: "o-nov", talent_profile_id: "tp-other", total_cents: 10_000, refunded_cents: 0 },
      { id: "l3", tenant_id: "t", order_id: "o-oct-created", talent_profile_id: ME, total_cents: 5_000, refunded_cents: 1_000 },
      { id: "l4", tenant_id: "t", order_id: "o-dec", talent_profile_id: ME, total_cents: 7_000, refunded_cents: 0 },
    ],
  });
  const args = { tenantId: "t", talentProfileId: ME, period: "2026-11", currency: "MXN" };
  test("November = the discounted November order (net 9,000) + the order created in October but PAID in November (net 4,000); December's order is out", async () => {
    assert.equal(await loadMemberSalesBase(fakeAdmin(world()), args), 13_000);
  });
  test("payout_pending and payout_sent are PAID (money reached the platform); a first payment that was later refunded still fixes the month", async () => {
    const w = world();
    (w.booking_transactions[0] as Record<string, unknown>).status = "payout_sent";
    (w.booking_transactions[1] as Record<string, unknown>).status = "payout_pending";
    assert.equal(await loadMemberSalesBase(fakeAdmin(w), args), 13_000);
    // o-nov first paid (and refunded) in October, a second payment in November: it belongs to October
    const w2 = world();
    w2.booking_transactions.push({ id: "x0", source_tenant_id: "t", order_id: "o-nov", status: "refunded", paid_at: "2026-10-20T12:00:00Z" });
    assert.equal(await loadMemberSalesBase(fakeAdmin(w2), args), 4_000);
  });
  test("a member line's own discount is subtracted (order_lines.discount_cents)", async () => {
    const w = world();
    (w.order_lines[2] as Record<string, unknown>).discount_cents = 1_000;
    (w.orders[1] as Record<string, unknown>).discount_cents = 1_000;
    // l3: 5,000 - 1,000 own - 0 spread - 1,000 refunded = 3,000; l1: 10,000 net of the 2,000 order discount over 20,000 = 9,000
    assert.equal(await loadMemberSalesBase(fakeAdmin(w), args), 12_000);
  });
  test("a rent invoice order (source_page rent) is never part of the base", async () => {
    const w = world();
    (w.orders[0] as Record<string, unknown>).source_page = "rent";
    assert.equal(await loadMemberSalesBase(fakeAdmin(w), args), 4_000);
  });
  test("no payments in the month: 0", async () => {
    assert.equal(await loadMemberSalesBase(fakeAdmin(world()), { ...args, period: "2026-09" }), 0);
  });
  test("any unreadable table fails closed (null), never a partial number", async () => {
    for (const t of ["booking_transactions", "orders", "order_lines"]) assert.equal(await loadMemberSalesBase(fakeAdmin(world(), t), args), null, t);
  });
});
