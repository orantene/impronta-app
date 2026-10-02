import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planAcceptCollection } from "./accept-offer-collection";
import { runAcceptOfferPayment, type AcceptOfferForPayment, type AcceptPaymentStore } from "./accept-offer-payment-core";
import type { AcceptPolicyLine } from "./accept-offer-collection";

const OFFER: AcceptOfferForPayment = { id: "of-1", version: 2, totalCents: 100_000, currency: "MXN", depositPct: null, depositCents: null };

/** In-memory store: one order per key, one link per idempotency key, cards appended. */
function fakeStore(policy: { lines: AcceptPolicyLine[]; talentDefaults: unknown }) {
  const orders = new Map<string, string>();
  const links = new Map<string, { code: string; amountCents: number }>();
  const cards: Array<{ kind: string; body: string; payload: Record<string, unknown> }> = [];
  let created = 0;
  const bookingCalls: Array<string | null> = [];
  const store: AcceptPaymentStore = {
    loadPolicy: async () => ({ ok: true, ...policy }),
    findOfferOrder: async (key) => orders.get(key) ?? null,
    createOfferOrder: async ({ orderKey }) => {
      created += 1;
      const id = `order-${created}`;
      orders.set(orderKey, id);
      return { ok: true, orderId: id };
    },
    mintLink: async ({ amountCents, idempotencyKey }) => {
      const prior = links.get(idempotencyKey);
      if (prior) return { ok: true, code: prior.code, amountCents: prior.amountCents, expiresAt: "2026-10-02T00:00:00Z", already: true };
      const code = `code-${links.size + 1}`;
      links.set(idempotencyKey, { code, amountCents });
      return { ok: true, code, amountCents, expiresAt: "2026-10-02T00:00:00Z", already: false };
    },
    hasCardFor: async (kind, offerId) => cards.some((c) => c.kind === kind && c.payload.offerId === offerId),
    postCard: async (card) => {
      cards.push(card);
    },
    ensureBooking: async ({ orderId }) => {
      bookingCalls.push(orderId);
      return { ok: true, bookingId: `booking-for-${orderId ?? "none"}`, scheduled: true };
    },
  };
  return { store, orders, links, cards, bookingCalls, createdCount: () => created };
}

describe("planAcceptCollection: offer term first, then the talent policy chain", () => {
  it("the offer's own deposit pct wins", () => {
    const plan = planAcceptCollection({ totalCents: 100_000, offerDepositPct: 30, offerDepositCents: null, lines: [], talentDefaults: { depositPct: 50 } });
    assert.deepEqual(plan, { collect: "deposit", amountCents: 30_000, depositPct: 30, source: "offer" });
  });

  it("a talent default deposit applies when the offer names none", () => {
    const plan = planAcceptCollection({ totalCents: 100_000, offerDepositPct: null, offerDepositCents: null, lines: [], talentDefaults: { depositPct: 25 } });
    assert.equal(plan.collect, "deposit");
    assert.equal(plan.amountCents, 25_000);
  });

  it("an offering on deposit, with the smallest pct across lines", () => {
    const plan = planAcceptCollection({
      totalCents: 100_000,
      offerDepositPct: null,
      offerDepositCents: null,
      lines: [
        { reserveMode: "deposit", depositPct: 40, sellingDefaults: {} },
        { reserveMode: "full", depositPct: 20, sellingDefaults: {} },
      ],
      talentDefaults: null,
    });
    assert.equal(plan.collect, "deposit");
    assert.equal(plan.amountCents, 20_000);
  });

  it("free reserve on every line = pay in person, nothing collected", () => {
    const plan = planAcceptCollection({
      totalCents: 100_000,
      offerDepositPct: null,
      offerDepositCents: null,
      lines: [{ reserveMode: "free", depositPct: null, sellingDefaults: { depositPct: 30 } }],
      talentDefaults: null,
    });
    assert.equal(plan.collect, "none");
  });

  it("no deposit anywhere = charge in full", () => {
    const plan = planAcceptCollection({ totalCents: 100_000, offerDepositPct: 0, offerDepositCents: 0, lines: [], talentDefaults: {} });
    assert.deepEqual(plan, { collect: "full", amountCents: 100_000, source: "policy" });
  });

  it("a zero total takes nothing", () => {
    assert.equal(planAcceptCollection({ totalCents: 0, offerDepositPct: 30, offerDepositCents: null, lines: [], talentDefaults: null }).collect, "none");
  });
});

describe("runAcceptOfferPayment: accept -> order -> pay card", () => {
  it("deposit policy: one order, a link for the deposit, a payment_request card with the code", async () => {
    const f = fakeStore({ lines: [], talentDefaults: { depositPct: 30 } });
    const res = await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.payCode, "code-1");
    assert.equal(res.orderId, "order-1");
    assert.equal(f.cards.length, 1);
    assert.equal(f.cards[0]!.kind, "payment_request");
    assert.equal(f.cards[0]!.payload.paymentLinkCode, "code-1");
    assert.equal(f.cards[0]!.payload.amountKind, "deposit");
    assert.equal(f.cards[0]!.payload.amountCents, 30_000);
  });

  it("pay in person: no order, no link, one confirmed card", async () => {
    const f = fakeStore({ lines: [{ reserveMode: "free", depositPct: null, sellingDefaults: {} }], talentDefaults: null });
    const res = await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.payCode, null);
    assert.equal(f.createdCount(), 0);
    assert.equal(f.links.size, 0);
    assert.deepEqual(f.cards.map((c) => c.kind), ["booking_confirmed"]);
    assert.equal(f.cards[0]!.payload.payInPerson, true);
    // Second accept: still one card.
    await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(f.cards.length, 1);
  });

  it("idempotent: a double accept reuses the order, the link and the card", async () => {
    const f = fakeStore({ lines: [], talentDefaults: {} });
    const first = await runAcceptOfferPayment(f.store, OFFER);
    const second = await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(f.createdCount(), 1);
    assert.equal(second.orderId, first.orderId);
    assert.equal(second.payCode, first.payCode);
    assert.equal(f.links.size, 1);
    assert.equal(f.cards.filter((c) => c.kind === "payment_request").length, 1);
    assert.equal(second.cardPosted, false);
    assert.equal(f.cards[0]!.payload.amountKind, "full");
  });

  it("a failed link mint reports link_unavailable and posts one clear notice card", async () => {
    const f = fakeStore({ lines: [], talentDefaults: {} });
    f.store.mintLink = async () => ({ ok: false, reason: "provider_unavailable" });
    const res = await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(res.ok, false);
    assert.deepEqual(f.cards.map((c) => c.kind), ["booking_status"]);
    assert.equal(f.cards[0]!.payload.payLinkFailed, true);
    // A retry does not stack a second notice.
    await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(f.cards.length, 1);
  });

  it("a lost create race finds the order the other accept created", async () => {
    const f = fakeStore({ lines: [], talentDefaults: {} });
    f.orders.set("offer_accept:of-1", "order-raced");
    let calls = 0;
    const realFind = f.store.findOfferOrder;
    f.store.findOfferOrder = async (k) => (calls++ === 0 ? null : realFind(k));
    f.store.createOfferOrder = async () => ({ ok: false });
    const res = await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.orderId, "order-raced");
  });
});

describe("runAcceptOfferPayment: the booking behind the order (P0 2026-10-01)", () => {
  it("the booking is written for the order BEFORE any link is minted", async () => {
    const f = fakeStore({ lines: [], talentDefaults: {} });
    const order: string[] = [];
    const realMint = f.store.mintLink;
    const realBook = f.store.ensureBooking;
    f.store.ensureBooking = async (i) => (order.push("booking"), realBook(i));
    f.store.mintLink = async (i) => (order.push("mint"), realMint(i));
    const res = await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(res.ok, true);
    assert.deepEqual(order, ["booking", "mint"]);
    assert.deepEqual(f.bookingCalls, ["order-1"]);
    if (res.ok) assert.equal(res.bookingId, "booking-for-order-1");
    assert.equal(f.cards[0]!.payload.bookingId, "booking-for-order-1");
  });

  it("no booking = no link: checkout must never fall back to a talentless shell", async () => {
    const f = fakeStore({ lines: [], talentDefaults: {} });
    f.store.ensureBooking = async () => ({ ok: false });
    let minted = 0;
    f.store.mintLink = async () => (minted++, { ok: false, reason: "x" });
    const res = await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "booking_unavailable");
    assert.equal(minted, 0);
    assert.deepEqual(f.cards.map((c) => c.kind), ["booking_status"]);
  });

  it("pay in person without an agreed time is not called confirmed", async () => {
    const f = fakeStore({ lines: [{ reserveMode: "free", depositPct: null, sellingDefaults: {} }], talentDefaults: null });
    f.store.ensureBooking = async () => ({ ok: true, bookingId: "b-1", scheduled: false });
    const res = await runAcceptOfferPayment(f.store, OFFER);
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.scheduled, false);
    assert.equal(f.cards[0]!.payload.needsTime, true);
    assert.doesNotMatch(f.cards[0]!.body, /^Confirmed/);
  });
});
