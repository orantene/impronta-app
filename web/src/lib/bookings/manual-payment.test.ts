import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  recordManualPayment,
  type ManualPaymentStore,
} from "./manual-payment";
import { summarizeLedgerPaid, type LedgerPaidRow } from "./ledger-paid";
import { buildMoneyHomeView } from "@/lib/talent/money-home";
import { EMPTY_TALENT_EARNINGS, type TalentEarnings } from "@/lib/talent/earnings-types";

type Txn = {
  id: string;
  booking_id: string;
  gross_amount_cents: number;
  status: string;
  provider: string;
  provider_reference: string | null;
  checkout_type: "deposit" | "balance" | "full";
  metadata: Record<string, unknown>;
  currency: string;
  paid_at: string | null;
};

/**
 * In-memory ledger that enforces the same rules the database does:
 * idx_booking_transactions_booking_active (one live non-deposit row per
 * inquiry-backed booking; a paid deposit leaves the slot) and the
 * draft -> payment_requested -> paid status graph.
 */
function memoryStore(booking: { totalCents: number; status?: string }) {
  const txns: Txn[] = [];
  const bookingRow = {
    id: "bk-1",
    tenantId: "t-1",
    status: booking.status ?? "confirmed",
    totalCents: booking.totalCents,
    currency: "MXN",
    payment_status: "unpaid",
    payment_method: null as string | null,
  };
  let seq = 0;
  const occupiesSlot = (t: Txn) =>
    !["cancelled", "failed", "refunded"].includes(t.status) &&
    !(t.checkout_type === "deposit" && ["paid", "payout_pending", "payout_sent"].includes(t.status));
  const store: ManualPaymentStore = {
    async loadBooking(id) {
      return id === bookingRow.id ? { ...bookingRow } : null;
    },
    async listLedger(id) {
      return txns
        .filter((t) => t.booking_id === id && !["cancelled", "failed", "refunded"].includes(t.status))
        .map((t) => ({ id: t.id, grossCents: t.gross_amount_cents, status: t.status, providerReference: t.provider_reference }));
    },
    async insertDraft(row) {
      const candidate: Txn = {
        id: `txn-${++seq}`,
        booking_id: row.bookingId,
        gross_amount_cents: row.amountCents,
        status: "draft",
        provider: "manual",
        provider_reference: row.reference,
        checkout_type: row.checkoutType,
        metadata: { paid_via: row.method },
        currency: row.currency,
        paid_at: null,
      };
      if (txns.some((t) => t.booking_id === row.bookingId && occupiesSlot(t))) {
        return { ok: false, conflict: true };
      }
      txns.push(candidate);
      return { ok: true, id: candidate.id };
    },
    async advance(id, status) {
      const t = txns.find((x) => x.id === id);
      if (!t) return false;
      const legal =
        (t.status === "draft" && status === "payment_requested") ||
        (t.status === "payment_requested" && status === "paid");
      if (!legal) return false;
      t.status = status;
      if (status === "paid") t.paid_at = "2026-10-01T12:00:00Z";
      return true;
    },
    async patchBooking(_id, patch) {
      bookingRow.payment_status = patch.payment_status;
      bookingRow.payment_method = patch.payment_method;
      return true;
    },
  };
  /** An online card deposit already settled through the card rail. */
  const seedOnlineDeposit = (cents: number) => {
    txns.push({
      id: `txn-${++seq}`,
      booking_id: "bk-1",
      gross_amount_cents: cents,
      status: "paid",
      provider: "stripe",
      provider_reference: "cs_test_1",
      checkout_type: "deposit",
      metadata: {},
      currency: "MXN",
      paid_at: "2026-09-30T12:00:00Z",
    });
  };
  const paidRows = () => txns.filter((t) => t.status === "paid");
  const paidSum = () => paidRows().reduce((n, t) => n + t.gross_amount_cents, 0);
  return { store, txns, bookingRow, seedOnlineDeposit, paidRows, paidSum };
}

const pay = (store: ManualPaymentStore, amountCents: number, method: "cash" | "transfer" | "card" | "other", key: string) =>
  recordManualPayment(store, { bookingId: "bk-1", amountCents, method, idempotencyKey: key });

describe("Record payment writes ONE manual ledger row", () => {
  it("cash in full: one paid manual row, booking paid", async () => {
    const m = memoryStore({ totalCents: 950_00 });
    const res = await pay(m.store, 950_00, "cash", "k1");
    assert.equal(res.ok, true);
    assert.equal(m.paidRows().length, 1);
    const row = m.paidRows()[0]!;
    assert.equal(row.provider, "manual");
    assert.equal(row.metadata.paid_via, "cash");
    assert.equal(row.checkout_type, "full");
    assert.equal(m.bookingRow.payment_status, "paid");
    assert.equal(m.bookingRow.payment_method, "cash");
    if (res.ok) assert.equal(res.remainingCents, 0);
  });

  it("cash partial then the rest: two rows, partial then paid, sum equals total", async () => {
    const m = memoryStore({ totalCents: 1000_00 });
    const first = await pay(m.store, 400_00, "cash", "k1");
    assert.equal(first.ok, true);
    assert.equal(m.bookingRow.payment_status, "partial");
    if (first.ok) assert.equal(first.remainingCents, 600_00);
    const second = await pay(m.store, 600_00, "cash", "k2");
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(m.bookingRow.payment_status, "paid");
    assert.equal(m.paidRows().length, 2);
    assert.equal(m.paidSum(), 1000_00);
    assert.deepEqual(m.paidRows().map((r) => r.checkout_type), ["deposit", "balance"]);
  });

  it("online deposit + cash balance never double counts", async () => {
    const m = memoryStore({ totalCents: 1000_00 });
    m.seedOnlineDeposit(300_00);
    // The whole price is refused: 300 is already in.
    const tooMuch = await pay(m.store, 1000_00, "cash", "k1");
    assert.deepEqual(tooMuch, { ok: false, reason: "over_total", remainingCents: 700_00 });
    const balance = await pay(m.store, 700_00, "cash", "k2");
    assert.equal(balance.ok, true);
    assert.equal(m.paidSum(), 1000_00);
    assert.equal(m.bookingRow.payment_status, "paid");
  });

  it("over-payment is refused with the amount still owed, nothing written", async () => {
    const m = memoryStore({ totalCents: 500_00 });
    const res = await pay(m.store, 500_01, "transfer", "k1");
    assert.deepEqual(res, { ok: false, reason: "over_total", remainingCents: 500_00 });
    assert.equal(m.txns.length, 0);
    await pay(m.store, 500_00, "transfer", "k2");
    const after = await pay(m.store, 1_00, "cash", "k3");
    assert.deepEqual(after, { ok: false, reason: "already_paid", remainingCents: 0 });
    assert.equal(m.paidSum(), 500_00);
  });

  it("double submit with the same key is idempotent", async () => {
    const m = memoryStore({ totalCents: 800_00 });
    const [a, b] = await Promise.all([pay(m.store, 300_00, "cash", "same"), pay(m.store, 300_00, "cash", "same")]);
    assert.equal(a.ok && b.ok, true, JSON.stringify([a, b]));
    const again = await pay(m.store, 300_00, "cash", "same");
    assert.equal(again.ok && again.already, true);
    assert.equal(m.txns.length, 1);
    assert.equal(m.paidSum(), 300_00);
  });

  it("a replay finishes a row a crashed attempt left at draft", async () => {
    const m = memoryStore({ totalCents: 200_00 });
    const realAdvance = m.store.advance;
    m.store.advance = async () => false;
    const crashed = await pay(m.store, 200_00, "cash", "k1");
    assert.equal(crashed.ok, false);
    m.store.advance = realAdvance;
    const replay = await pay(m.store, 200_00, "cash", "k1");
    assert.equal(replay.ok, true);
    assert.equal(m.txns.length, 1);
    assert.equal(m.txns[0]!.status, "paid");
    assert.equal(m.bookingRow.payment_status, "paid");
  });

  it("refuses a booking with no price and a bad amount", async () => {
    assert.deepEqual(await pay(memoryStore({ totalCents: 0 }).store, 100, "cash", "k"), { ok: false, reason: "no_total" });
    assert.deepEqual(await pay(memoryStore({ totalCents: 100 }).store, 0, "cash", "k"), { ok: false, reason: "invalid_amount" });
    assert.deepEqual(await pay(memoryStore({ totalCents: 100, status: "cancelled" }).store, 100, "cash", "k"), {
      ok: false,
      reason: "cancelled",
    });
  });
});

describe("Money totals read the new ledger row", () => {
  function earningsFrom(rows: LedgerPaidRow[], booking: { status: TalentEarnings["rows"][number]["status"]; paymentStatus: string }): TalentEarnings {
    const ledger = summarizeLedgerPaid(rows).get("bk-1")!;
    return {
      ...EMPTY_TALENT_EARNINGS,
      totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: "MXN" },
      rows: [
        {
          id: "bt-1",
          bookingId: "bk-1",
          workDate: "2026-10-01",
          payoutDate: null,
          agencyName: "",
          client: "Ana",
          grossCents: 1000_00,
          netCents: ledger.paidCents,
          status: booking.status,
          source: "personal_page",
          paymentMethod: ledger.lastMethod,
          paymentStatus: booking.paymentStatus,
          collectedCents: ledger.paidCents,
          collectedByMethod: ledger.byMethod,
        },
      ],
    };
  }

  it("a cash part payment shows as collected cash for what was received", async () => {
    const m = memoryStore({ totalCents: 1000_00 });
    await pay(m.store, 400_00, "cash", "k1");
    const view = buildMoneyHomeView({
      earnings: earningsFrom(m.txns, { status: "pending", paymentStatus: "partial" }),
      clients: null,
      month: "2026-10",
    });
    assert.equal(view.collectedCents, 400_00);
    assert.equal(view.collectedCount, 1);
    assert.equal(view.byMethod.cash, 400_00);
  });

  it("online deposit + cash balance split by method, total equals the booking", async () => {
    const m = memoryStore({ totalCents: 1000_00 });
    m.seedOnlineDeposit(300_00);
    await pay(m.store, 700_00, "cash", "k1");
    const view = buildMoneyHomeView({
      earnings: earningsFrom(m.txns, { status: "pending", paymentStatus: "paid" }),
      clients: null,
      month: "2026-10",
    });
    assert.equal(view.collectedCents, 1000_00);
    assert.equal(view.byMethod.card, 300_00);
    assert.equal(view.byMethod.cash, 700_00);
  });

  it("transfer and card-in-person land in their own buckets", () => {
    const sum = summarizeLedgerPaid([
      { booking_id: "b", gross_amount_cents: 100, status: "paid", provider: "manual", metadata: { paid_via: "transfer" } },
      { booking_id: "b", gross_amount_cents: 50, status: "paid", provider: "manual", metadata: { paid_via: "card" } },
      { booking_id: "b", gross_amount_cents: 999, status: "refunded", provider: "manual", metadata: { paid_via: "cash" } },
    ]).get("b")!;
    assert.equal(sum.paidCents, 150);
    assert.deepEqual(sum.byMethod, { transfer: 100, card: 50 });
  });
});
