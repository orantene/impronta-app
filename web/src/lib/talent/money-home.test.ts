import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentClientRow } from "./clients-merge";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings, type TalentEarningsRow } from "./earnings-types";
import { buildMoneyHomeView, methodBucket, moneyMonths, shiftMonth } from "./money-home";

function row(p: Partial<TalentEarningsRow>): TalentEarningsRow {
  return {
    id: p.id ?? "r",
    bookingId: "b",
    workDate: "2026-09-10",
    payoutDate: null,
    agencyName: "A",
    client: "C",
    grossCents: 1000,
    netCents: 900,
    status: "paid",
    source: "personal_page",
    paymentMethod: "card",
    ...p,
  };
}

function earnings(rows: TalentEarningsRow[]): TalentEarnings {
  return { ...EMPTY_TALENT_EARNINGS, totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: "MXN" }, rows };
}

function client(p: Partial<TalentClientRow>): TalentClientRow {
  return {
    id: "c",
    name: "Regina",
    lastVisit: null,
    completedCount: 0,
    visitCount: 0,
    amountOwedCents: null,
    currency: "MXN",
    conversationHref: null,
    source: "booking",
    phone: null,
    email: null,
    nextStartsAt: null,
    nextStatus: null,
    nextBookingHref: null,
    overdue: false,
    ...p,
  };
}

describe("money-home", () => {
  it("shifts months across years", () => {
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
  });

  it("buckets methods", () => {
    assert.equal(methodBucket("apple_pay"), "card");
    assert.equal(methodBucket("bank_transfer"), "transfer");
    assert.equal(methodBucket("cash"), "cash");
    assert.equal(methodBucket(null), "other");
  });

  it("collects only paid rows in the month, split by method", () => {
    const v = buildMoneyHomeView({
      month: "2026-09",
      clients: [],
      earnings: earnings([
        row({ id: "1", paymentMethod: "card", grossCents: 500 }),
        row({ id: "2", paymentMethod: "cash", grossCents: 300, status: "pending" }),
        row({ id: "3", status: "confirmed" }),
        row({ id: "4", workDate: "2026-08-30" }),
      ]),
    });
    assert.equal(v.collectedCents, 800);
    assert.equal(v.collectedCount, 2);
    assert.equal(v.byMethod.card, 500);
    assert.equal(v.byMethod.cash, 300);
  });

  it("groups payouts by date and sums the scheduled next payout", () => {
    const v = buildMoneyHomeView({
      month: "2026-09",
      clients: [],
      earnings: earnings([
        row({ id: "1", payoutDate: "2026-09-18", netCents: 100 }),
        row({ id: "2", payoutDate: "2026-09-18", netCents: 200 }),
        row({ id: "3", status: "invoiced", payoutDate: null, netCents: 50 }),
      ]),
    });
    assert.equal(v.paidOutCents, 300);
    assert.equal(v.payouts.length, 2);
    assert.equal(v.nextPayoutCents, 50);
    assert.equal(v.nextPayoutDate, null);
  });

  it("returns null next payout when none is scheduled", () => {
    const v = buildMoneyHomeView({ month: "2026-09", clients: null, earnings: earnings([]) });
    assert.equal(v.nextPayoutCents, null);
    assert.equal(v.owedCents, 0);
  });

  it("lists owed clients in this currency, overdue first", () => {
    const v = buildMoneyHomeView({
      month: "2026-09",
      earnings: earnings([]),
      clients: [
        client({ id: "a", amountOwedCents: 5000 }),
        client({ id: "b", amountOwedCents: 1000, overdue: true }),
        client({ id: "c", amountOwedCents: 9000, currency: "USD" }),
        client({ id: "d", amountOwedCents: 0 }),
      ],
    });
    assert.deepEqual(v.owed.map((o) => o.id), ["b", "a"]);
    assert.equal(v.owedCents, 6000);
    assert.equal(v.overdueCents, 1000);
  });

  it("lists months with data plus the current one", () => {
    const m = moneyMonths(earnings([row({ workDate: "2026-07-02", payoutDate: "2026-08-01" })]), "2026-09");
    assert.deepEqual(m, ["2026-09", "2026-08", "2026-07"]);
  });
});
