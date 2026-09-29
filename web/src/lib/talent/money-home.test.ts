import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentClientRow } from "./clients-merge";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings, type TalentEarningsRow } from "./earnings-types";
import { agendaMoneyRows, buildMoneyHomeView, methodBucket, moneyMonths, shiftMonth } from "./money-home";

describe("agendaMoneyRows", () => {
  const now = new Date(2026, 8, 28, 12, 0);
  const base = {
    kind: "hold" as const,
    title: "Bozo",
    client: { name: "Bozo", initials: "B" },
    startsAt: new Date(2026, 8, 28, 10, 0).toISOString(),
    booking: "hold" as const,
    payment: "awaiting" as const,
    money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" },
  };
  it("lists holds awaiting a deposit as waiting requests, with no invented amount", () => {
    const out = agendaMoneyRows([{ ...base, id: "h1" }], now);
    assert.equal(out.owed.length, 0);
    assert.equal(out.waiting.length, 1);
    assert.equal(out.waiting[0]!.amountCents, null);
    assert.equal(out.waiting[0]!.dueByToday, true);
    assert.equal(out.waiting[0]!.service, "");
  });
  it("counts balances due on booked work as owed", () => {
    const out = agendaMoneyRows(
      [
        {
          ...base,
          id: "b1",
          kind: "booking",
          booking: "confirmed",
          payment: "partial",
          title: "Gel polish",
          money: { totalCents: 90000, paidCents: 30000, dueCents: 60000, currency: "MXN" },
        },
        { ...base, id: "c1", booking: "cancelled" },
      ],
      now,
    );
    assert.deepEqual(
      out.owed.map((r) => [r.id, r.amountCents, r.service]),
      [["b1", 60000, "Gel polish"]],
    );
    assert.equal(out.waiting.length, 0);
  });
});

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
        row({ id: "2", paymentMethod: "cash", grossCents: 300, status: "pending", paymentStatus: "paid" }),
        row({ id: "3", status: "confirmed" }),
        row({ id: "4", workDate: "2026-08-30" }),
      ]),
    });
    assert.equal(v.collectedCents, 800);
    assert.equal(v.collectedCount, 2);
    assert.equal(v.byMethod.card, 500);
    assert.equal(v.byMethod.cash, 300);
  });

  it("excludes partial deposits from Collected (do not count full gross)", () => {
    const v = buildMoneyHomeView({
      month: "2026-09",
      clients: [],
      earnings: earnings([
        row({
          id: "partial",
          paymentMethod: "card",
          grossCents: 100_000,
          status: "pending",
          paymentStatus: "partial",
        }),
        row({ id: "full", paymentMethod: "cash", grossCents: 50_000, status: "paid" }),
      ]),
    });
    assert.equal(v.collectedCents, 50_000);
    assert.equal(v.collectedCount, 1);
    assert.equal(v.byMethod.card, 0);
    assert.equal(v.byMethod.cash, 50_000);
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
