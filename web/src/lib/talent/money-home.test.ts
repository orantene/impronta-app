import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentClientRow } from "./clients-merge";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings, type TalentEarningsRow } from "./earnings-types";
import { agendaMoneyRows, buildMoneyHomeView, methodBucket, moneyMonths, shiftMonth, talentOwedSummary } from "./money-home";
import { readFileSync } from "node:fs";

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
  it("Money month select does not use CSS capitalize (Octubre De bug)", () => {
    const src = readFileSync(
      new URL("../../components/talent/money/MoneyHomePage.tsx", import.meta.url),
      "utf8",
    );
    assert.equal(/className="[^"]*\bcapitalize\b/.test(src), false);
    assert.match(src, /formatMonthLabel/);
  });
  it("lists holds awaiting a deposit as waiting requests, with no invented amount", () => {
    const out = agendaMoneyRows([{ ...base, id: "h1" }], now);
    assert.equal(out.owed.length, 0);
    assert.equal(out.waiting.length, 1);
    assert.equal(out.waiting[0]!.amountCents, null);
    assert.equal(out.waiting[0]!.dueByToday, true);
    assert.equal(out.waiting[0]!.service, "");
  });
  it("does not count cancelled bookings as waiting payment requests", () => {
    const out = agendaMoneyRows(
      [
        {
          ...base,
          id: "c2",
          kind: "booking",
          booking: "cancelled",
          payment: "awaiting",
          money: { totalCents: 50000, paidCents: 0, dueCents: 50000, currency: "MXN" },
        },
        {
          ...base,
          id: "h2",
          kind: "hold",
          booking: "cancelled",
          payment: "awaiting",
          money: { totalCents: 1, paidCents: 0, dueCents: 1, currency: "MXN" },
        },
      ],
      now,
    );
    assert.equal(out.waiting.length, 0);
    assert.equal(out.owed.length, 0);
    assert.equal(out.refundPending.length, 0);
  });

  it("surfaces paid_after_cancellation as refund pending on Money", () => {
    const out = agendaMoneyRows(
      [
        {
          ...base,
          id: "pac",
          kind: "booking",
          booking: "cancelled",
          payment: "refund_pending",
          money: { totalCents: 30000, paidCents: 30000, dueCents: 0, currency: "MXN" },
        },
      ],
      now,
    );
    assert.equal(out.waiting.length, 0);
    assert.equal(out.owed.length, 0);
    assert.equal(out.refundPending.length, 1);
    assert.equal(out.refundPending[0]!.kind, "refund_pending");
    assert.equal(out.refundPending[0]!.amountCents, 30000);
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

describe("F69 talentOwedSummary: Today card and Money page share one number", () => {
  const three = [
    client({ id: "a", name: "A", amountOwedCents: 3000, currency: "USD", nextBookingHref: "/talent/bookings/a" }),
    client({ id: "b", name: "B", amountOwedCents: 2800, currency: "USD", nextBookingHref: "/talent/bookings/b" }),
    client({ id: "c", name: "C", amountOwedCents: 1000, currency: "USD", nextBookingHref: "/talent/bookings/c" }),
  ];
  it("shows the ledger balances when the agenda has none (the Today US$0 bug)", () => {
    const s = talentOwedSummary({ clients: three, agendaOwed: [], currency: "USD" });
    assert.equal(s.cents, 6800);
    assert.equal(s.count, 3);
    assert.equal(s.currency, "USD");
    const view = buildMoneyHomeView({ earnings: { ...EMPTY_TALENT_EARNINGS, totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: "USD" } }, clients: three, month: "2026-09" });
    assert.equal(s.cents, view.owedCents, "identical to the Money page ledger");
  });
  it("takes the larger of ledger and agenda, and does not double count a shared booking", () => {
    const row = { id: "x", name: "A", service: "", startsAt: "2026-09-01T10:00:00Z", amountCents: 9000, currency: "USD", kind: "balance" as const, overdue: false, dueByToday: true, orderId: null, bookingHref: "/talent/bookings/a" };
    const s = talentOwedSummary({ clients: three, agendaOwed: [row], currency: "USD" });
    assert.equal(s.cents, 9000);
    assert.equal(s.count, 3);
  });
  it("agenda only until the ledger loads; other currencies stay out", () => {
    assert.deepEqual(talentOwedSummary({ clients: null, agendaOwed: [], currency: "USD" }), { cents: 0, count: 0, currency: "USD", others: [] });
    const mxn = [client({ id: "m", amountOwedCents: 5000, currency: "MXN" })];
    assert.equal(talentOwedSummary({ clients: mxn, agendaOwed: [], currency: "USD" }).cents, 0);
  });
  it("never sums across currencies: MXN agenda rows are reported apart from USD", () => {
    const row = { id: "x", name: "Z", service: "", startsAt: "2026-09-01T10:00:00Z", amountCents: 8400, currency: "MXN", kind: "balance" as const, overdue: false, dueByToday: true, orderId: null, bookingHref: "/talent/bookings/z" };
    const s = talentOwedSummary({ clients: three, agendaOwed: [row], currency: "USD" });
    assert.equal(s.cents, 6800);
    assert.deepEqual(s.others, [{ currency: "MXN", cents: 8400 }]);
  });
  it("Today card and Money page both read the shared summary", () => {
    for (const f of ["../../components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx", "../../components/talent/money/MoneyHomePage.tsx"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      assert.ok(src.includes("talentOwedSummary("), f);
    }
    const today = readFileSync(new URL("../../components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx", import.meta.url), "utf8");
    assert.ok(today.includes("loadTalentClients("), "Today reads the same client ledger");
  });
});

describe("buildMoneyHomeView net of refunds", () => {
  const row = (over: Partial<TalentEarningsRow>): TalentEarningsRow => ({
    id: "r1", bookingId: "b1", workDate: "2026-10-09", payoutDate: null, agencyName: "A", client: "C",
    grossCents: 100000, netCents: 100000, status: "pending", source: "direct", paymentMethod: "card",
    paymentStatus: "paid", collectedCents: 100000, collectedByMethod: { card: 100000 }, ...over,
  } as TalentEarningsRow);
  const earnings = (rows: TalentEarningsRow[]): TalentEarnings => ({ ...EMPTY_TALENT_EARNINGS, totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: "MXN" }, rows });

  it("Collected is the month total minus refunds, with the refunded amount exposed for the sub-line", () => {
    const v = buildMoneyHomeView({ earnings: earnings([row({ refundedCents: 60000 })]), clients: [], month: "2026-10" });
    assert.equal(v.collectedCents, 40000);
    assert.equal(v.refundedCents, 60000);
    assert.equal(v.byMethod.card, 40000);
  });
  it("no refunds leaves Collected unchanged", () => {
    const v = buildMoneyHomeView({ earnings: earnings([row({})]), clients: [], month: "2026-10" });
    assert.equal(v.collectedCents, 100000);
    assert.equal(v.refundedCents, 0);
  });
  it("never goes below zero", () => {
    const v = buildMoneyHomeView({ earnings: earnings([row({ refundedCents: 150000 })]), clients: [], month: "2026-10" });
    assert.equal(v.collectedCents, 0);
  });
  it("the card shows the refunded sub-line", () => {
    const src = readFileSync(new URL("../../components/talent/money/MoneyHomePage.tsx", import.meta.url), "utf8");
    assert.match(src, /view\.refundedCents > 0/);
  });
});
