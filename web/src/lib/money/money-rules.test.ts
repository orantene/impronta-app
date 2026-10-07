import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentClientRow } from "@/lib/talent/clients-merge";
import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";
import { agendaMoneyRows, buildMoneyHomeView, talentOwedSummary } from "@/lib/talent/money-home";
import { deriveBookingState } from "@/lib/talent-agenda/derive";
import { summarizeLedgerPaid } from "@/lib/bookings/ledger-paid";
import {
  recordManualPayment,
  sumMoneyIn,
  type LedgerMoneyRow,
  type ManualPaymentStore,
} from "@/lib/bookings/manual-payment";
import { formatMonthLabel, isDeadBookingStatus, monthKeyInZone } from "./money-rules";

const row = (o: Partial<TalentEarningsRow>): TalentEarningsRow => ({
  id: "r",
  bookingId: "b",
  workDate: "2026-10-05",
  payoutDate: null,
  agencyName: "A",
  client: "C",
  grossCents: 100000,
  netCents: 100000,
  status: "pending",
  source: "personal_page",
  paymentMethod: "cash",
  paymentStatus: "paid",
  collectedCents: null,
  collectedByMethod: null,
  ...o,
});
const earnings = (rows: TalentEarningsRow[], currency = "MXN"): TalentEarnings =>
  ({ totals: { ytdGrossCents: 0, ytdNetCents: 0, pendingCents: 0, confirmedPipelineCents: 0, currency }, perAgency: [], rows }) as TalentEarnings;
const client = (o: Partial<TalentClientRow>): TalentClientRow =>
  ({ id: "c", name: "C", amountOwedCents: 0, currency: "MXN", overdue: false, nextStartsAt: null, nextBookingHref: null, conversationHref: null, ...o }) as TalentClientRow;

const item = (o: Record<string, unknown>) =>
  ({
    kind: "booking",
    title: "T",
    client: { name: "C", initials: "C" },
    startsAt: "2026-10-05T10:00:00.000Z",
    booking: "confirmed",
    payment: "due",
    money: { totalCents: 50000, paidCents: 0, dueCents: 50000, currency: "MXN" },
    ...o,
  }) as Parameters<typeof agendaMoneyRows>[0][number];

describe("money rules: dead bookings never owe or wait", () => {
  it("classifies cancelled, void, declined, expired and no-show as dead", () => {
    for (const s of ["cancelled", "canceled", "void", "declined", "expired", "no_show", "refunded", "hold_expired"]) {
      assert.equal(isDeadBookingStatus(s), true, s);
    }
    for (const s of ["confirmed", "completed", "hold", null, undefined]) assert.equal(isDeadBookingStatus(s), false);
  });
  it("maps void / declined raw statuses to a cancelled agenda state", () => {
    const now = new Date();
    assert.equal(deriveBookingState({ kind: "booking", status: "void", now }), "cancelled");
    assert.equal(deriveBookingState({ kind: "booking", status: "declined", now }), "cancelled");
    assert.equal(deriveBookingState({ kind: "booking", status: "expired", now }), "hold_expired");
  });
  it("six cancelled test bookings produce no owed and no waiting", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      item({ id: `x${i}`, booking: "cancelled", payment: "awaiting" }),
    );
    const out = agendaMoneyRows(items, new Date("2026-10-05T12:00:00Z"));
    assert.equal(out.waiting.length, 0);
    assert.equal(out.owed.length, 0);
    assert.equal(talentOwedSummary({ clients: null, agendaOwed: out.owed, currency: "MXN" }).cents, 0);
  });
});

describe("money rules: collected", () => {
  it("counts a cash part payment for what was collected, not the whole booking", () => {
    const v = buildMoneyHomeView({
      earnings: earnings([row({ paymentStatus: "partial", collectedCents: 30000, collectedByMethod: { cash: 30000 } })]),
      clients: null,
      month: "2026-10",
    });
    assert.equal(v.collectedCents, 30000);
    assert.equal(v.byMethod.cash, 30000);
  });
  it("counts a recorded transfer in the transfer bucket", () => {
    const v = buildMoneyHomeView({
      earnings: earnings([row({ paymentMethod: "transfer", collectedCents: 100000, collectedByMethod: { transfer: 100000 } })]),
      clients: null,
      month: "2026-10",
    });
    assert.equal(v.byMethod.transfer, 100000);
    assert.equal(v.byMethod.cash, 0);
  });
  it("a partial row with no ledger amount is not collected", () => {
    const v = buildMoneyHomeView({
      earnings: earnings([row({ paymentStatus: "partial", collectedCents: null })]),
      clients: null,
      month: "2026-10",
    });
    assert.equal(v.collectedCents, 0);
  });
  it("ledger sums ignore refunded and cancelled rows", () => {
    const rows = [
      { booking_id: "b", gross_amount_cents: 50000, status: "paid", provider: "stripe" },
      { booking_id: "b", gross_amount_cents: 20000, status: "refunded", provider: "stripe" },
      { booking_id: "b", gross_amount_cents: 10000, status: "cancelled", provider: "manual" },
      { booking_id: "b", gross_amount_cents: 30000, status: "paid", provider: "manual", metadata: { paid_via: "cash" } },
    ];
    const s = summarizeLedgerPaid(rows).get("b")!;
    assert.equal(s.paidCents, 80000);
    assert.deepEqual(s.byMethod, { card: 50000, cash: 30000 });
  });
  it("month boundary: a September row is not in October", () => {
    const v = buildMoneyHomeView({
      earnings: earnings([row({ workDate: "2026-09-30", collectedCents: 1000 }), row({ id: "o", workDate: "2026-10-01", collectedCents: 2000 })]),
      clients: null,
      month: "2026-10",
    });
    assert.equal(v.collectedCents, 2000);
  });
});

describe("money rules: currency", () => {
  it("never sums MXN owed into a USD total", () => {
    const s = talentOwedSummary({
      clients: [client({ id: "a", amountOwedCents: 5000, currency: "USD" }), client({ id: "b", amountOwedCents: 90000, currency: "MXN" })],
      agendaOwed: [],
      currency: "USD",
    });
    assert.equal(s.cents, 5000);
    assert.deepEqual(s.others, [{ currency: "MXN", cents: 90000 }]);
  });
  it("home view owed ignores other-currency clients", () => {
    const v = buildMoneyHomeView({
      earnings: earnings([], "MXN"),
      clients: [client({ id: "a", amountOwedCents: 7000, currency: "MXN" }), client({ id: "b", amountOwedCents: 9000, currency: "USD" })],
      month: "2026-10",
    });
    assert.equal(v.owedCents, 7000);
  });
});

describe("money rules: month key and label", () => {
  it("uses the talent timezone at the month edge", () => {
    const edge = new Date("2026-11-01T03:30:00Z");
    assert.equal(monthKeyInZone(edge, "America/Mexico_City"), "2026-10");
    assert.equal(monthKeyInZone(edge, "Europe/Madrid"), "2026-11");
    assert.equal(monthKeyInZone(edge, "Not/AZone"), "2026-11");
  });
  it("formats EN and ES labels without 'de' or title case", () => {
    assert.equal(formatMonthLabel("2026-10", "es"), "octubre 2026");
    assert.equal(formatMonthLabel("2026-10", "es-MX"), "octubre 2026");
    assert.equal(formatMonthLabel("2026-10", "en"), "October 2026");
  });
});

describe("money rules: manual payments write ledger rows", () => {
  function store(initial: LedgerMoneyRow[]) {
    const ledger = [...initial];
    const inserted: Array<{ checkoutType: string; method: string }> = [];
    const s: ManualPaymentStore = {
      async loadBooking() {
        return { id: "b", tenantId: "t", status: "confirmed", totalCents: 100000, currency: "MXN" };
      },
      async listLedger() {
        return ledger.map((r) => ({ ...r }));
      },
      async insertDraft(r) {
        inserted.push({ checkoutType: r.checkoutType, method: r.method });
        ledger.push({ id: `n${ledger.length}`, grossCents: r.amountCents, status: "draft", providerReference: r.reference });
        return { ok: true, id: `n${ledger.length - 1}` };
      },
      async advance(id, status) {
        const r = ledger.find((x) => x.id === id)!;
        r.status = status;
        return true;
      },
      async patchBooking() {
        return true;
      },
    };
    return { s, ledger, inserted };
  }
  it("transfer received writes a paid ledger row and settles the booking", async () => {
    const { s, ledger, inserted } = store([]);
    const res = await recordManualPayment(s, { bookingId: "b", amountCents: 100000, method: "transfer", idempotencyKey: "k1" });
    assert.equal(res.ok && res.paymentStatus, "paid");
    assert.equal(sumMoneyIn(ledger), 100000);
    assert.deepEqual(inserted, [{ checkoutType: "full", method: "transfer" }]);
  });
  it("cash part payment is a manual deposit row beside an online deposit, then balance completes", async () => {
    const { s, ledger, inserted } = store([{ id: "online", grossCents: 20000, status: "paid", providerReference: "pi_1" }]);
    const part = await recordManualPayment(s, { bookingId: "b", amountCents: 30000, method: "cash", idempotencyKey: "k2" });
    assert.equal(part.ok && part.paymentStatus, "partial");
    const rest = await recordManualPayment(s, { bookingId: "b", amountCents: 50000, method: "cash", idempotencyKey: "k3" });
    assert.equal(rest.ok && rest.paymentStatus, "paid");
    assert.equal(sumMoneyIn(ledger), 100000);
    assert.deepEqual(inserted.map((i) => i.checkoutType), ["deposit", "balance"]);
  });
  it("replaying the same key does not double count", async () => {
    const { s, ledger } = store([]);
    await recordManualPayment(s, { bookingId: "b", amountCents: 40000, method: "cash", idempotencyKey: "k4" });
    await recordManualPayment(s, { bookingId: "b", amountCents: 40000, method: "cash", idempotencyKey: "k4" });
    assert.equal(sumMoneyIn(ledger), 40000);
  });
});
