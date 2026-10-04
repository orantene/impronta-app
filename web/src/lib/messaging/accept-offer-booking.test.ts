import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ownBookingGate } from "@/lib/talent-agenda/ownership";
import { settleMoneyOnCancel } from "@/lib/talent-agenda/cancel-money";

import {
  ensureOfferBooking,
  orderLinesFromOffer,
  planOfferBooking,
  type OfferBookingStore,
  type OfferBookingWindow,
} from "./accept-offer-booking-core";

const TALENT = "tal-jor";
const WINDOW: OfferBookingWindow = {
  talentProfileId: TALENT,
  startsAt: "2026-10-05T16:00:00.000Z",
  endsAt: "2026-10-05T17:00:00.000Z",
  timezone: "America/Mexico_City",
  holdId: "hold-1",
};

type Booking = { id: string; orderId: string | null; status: string; startsAt: string | null; legs: string[]; mirror: boolean };

/** In-memory rows: agency_bookings (+ legs, mirror), order_lines.booking_id, holds. */
function memory(opts: { talent?: string | null; window?: OfferBookingWindow | null; mirror?: "ok" | "taken" | "failed" } = {}) {
  const bookings: Booking[] = [];
  const lineLinks = new Map<string, string>();
  const released: Array<string | null> = [];
  const store: OfferBookingStore = {
    resolveTalent: async () => (opts.talent === undefined ? TALENT : opts.talent),
    resolveWindow: async () => ({ ok: true, window: opts.window === undefined ? null : opts.window }),
    findBooking: async (orderId) => {
      const b = bookings.find((x) => x.orderId === orderId && x.status !== "cancelled");
      return { ok: true, bookingId: b?.id ?? null, scheduled: b?.status === "confirmed" };
    },
    insertBooking: async ({ orderId, plan }) => {
      const id = `booking-${bookings.length + 1}`;
      bookings.push({ id, orderId, status: plan.status, startsAt: plan.window?.startsAt ?? null, legs: [], mirror: false });
      return { ok: true, bookingId: id };
    },
    ensureTalentLeg: async ({ bookingId, talentProfileId }) => {
      const b = bookings.find((x) => x.id === bookingId)!;
      if (!b.legs.includes(talentProfileId)) b.legs.push(talentProfileId);
      return true;
    },
    insertMirror: async ({ bookingId }) => {
      const r = opts.mirror ?? "ok";
      if (r === "ok") bookings.find((x) => x.id === bookingId)!.mirror = true;
      return r;
    },
    markUnscheduled: async (bookingId) => {
      const b = bookings.find((x) => x.id === bookingId)!;
      b.status = "draft";
      b.startsAt = null;
    },
    releaseHolds: async (holdId) => {
      released.push(holdId);
    },
    linkOrderLines: async ({ orderId, bookingId }) => {
      lineLinks.set(orderId, bookingId);
    },
    removeBooking: async (bookingId) => {
      const i = bookings.findIndex((x) => x.id === bookingId);
      if (i >= 0) bookings.splice(i, 1);
    },
  };
  return { store, bookings, lineLinks, released };
}

/** The talent's cancel gate, fed the way requireOwnBooking feeds it. */
function talentMayCancel(b: Booking, talentId: string) {
  return ownBookingGate({
    bookingId: b.id,
    hasSessionUser: true,
    userId: "user-jor",
    talentProfileId: talentId,
    onBookingTalent: b.legs.includes(talentId),
    ownsTalentBookingMirror: b.mirror && talentId === TALENT,
  });
}

describe("planOfferBooking: confirmed needs a real window", () => {
  it("a window confirms", () => assert.equal(planOfferBooking(WINDOW).status, "confirmed"));
  it("no window stays draft, never confirmed", () => assert.deepEqual(planOfferBooking(null), { status: "draft", scheduled: false, window: null }));
  it("a broken window is no window", () => assert.equal(planOfferBooking({ ...WINDOW, endsAt: WINDOW.startsAt }).status, "draft"));
});

describe("ensureOfferBooking: accept with an agreed time", () => {
  it("confirmed, on the talent's calendar, linked to the talent and the order, hold released", async () => {
    const m = memory({ window: WINDOW });
    const res = await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.scheduled, true);
    const b = m.bookings[0]!;
    assert.equal(b.status, "confirmed");
    assert.equal(b.startsAt, WINDOW.startsAt);
    assert.equal(b.orderId, "order-1");
    assert.deepEqual(b.legs, [TALENT]);
    assert.equal(b.mirror, true);
    assert.equal(m.lineLinks.get("order-1"), b.id);
    assert.deepEqual(m.released, ["hold-1"]);
  });

  it("the talent can cancel it (the gate that used to say unauthorized)", async () => {
    const m = memory({ window: WINDOW });
    await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.equal(talentMayCancel(m.bookings[0]!, TALENT).ok, true);
    assert.equal(talentMayCancel(m.bookings[0]!, "tal-other").ok, false);
  });

  it("the talent's cancel voids the order and takes the link down", async () => {
    const m = memory({ window: WINDOW });
    await ensureOfferBooking(m.store, { orderId: "order-1" });
    const calls: string[] = [];
    const admin = fakeMoneyAdmin(calls);
    const money = await settleMoneyOnCancel(
      admin as never,
      { tenantId: "t-1", orderId: m.bookings[0]!.orderId },
      { cancelPaymentLink: async (_a: unknown, i: { linkId: string }) => (calls.push(`cancel-link:${i.linkId}`), { ok: true }) } as never,
    );
    assert.equal(money.ok, true);
    assert.ok(calls.includes("cancel-link:link-1"), calls.join(","));
    assert.ok(calls.some((c) => c.startsWith("orders.update")), calls.join(","));
  });

  it("a window held for another talent does not confirm this talent", async () => {
    const m = memory({ window: { ...WINDOW, talentProfileId: "tal-other" } });
    const res = await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.equal(res.ok && res.scheduled, false);
    assert.equal(m.bookings[0]!.status, "draft");
  });

  it("the time was taken meanwhile: kept, but draft and off the calendar", async () => {
    const m = memory({ window: WINDOW, mirror: "taken" });
    const res = await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.equal(res.ok && res.scheduled, false);
    assert.equal(m.bookings[0]!.status, "draft");
    assert.equal(m.bookings[0]!.startsAt, null);
    assert.deepEqual(m.released, []);
    assert.equal(talentMayCancel(m.bookings[0]!, TALENT).ok, true);
  });
});

describe("ensureOfferBooking: accept with no agreed time", () => {
  it("pending schedule (draft), not confirmed, still the talent's to cancel", async () => {
    const m = memory({ window: null });
    const res = await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.scheduled, false);
    const b = m.bookings[0]!;
    assert.notEqual(b.status, "confirmed");
    assert.equal(b.status, "draft");
    assert.equal(b.startsAt, null);
    assert.equal(b.mirror, false);
    assert.equal(talentMayCancel(b, TALENT).ok, true);
    assert.equal(m.lineLinks.get("order-1"), b.id);
  });

  it("no talent resolvable: nothing is written", async () => {
    const m = memory({ talent: null });
    const res = await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.deepEqual(res, { ok: false, reason: "no_talent" });
    assert.equal(m.bookings.length, 0);
  });
});

describe("ensureOfferBooking: idempotent and self-healing", () => {
  it("a retry reuses the booking, writes no second one", async () => {
    const m = memory({ window: WINDOW });
    const a = await ensureOfferBooking(m.store, { orderId: "order-1" });
    const b = await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.equal(m.bookings.length, 1);
    assert.equal(a.ok && b.ok && a.bookingId === b.bookingId, true);
    if (b.ok) assert.equal(b.scheduled, true);
  });

  it("an existing talentless shell for the order (the old defect) gets the talent leg", async () => {
    const m = memory({ window: null });
    m.bookings.push({ id: "shell-2032ac8c", orderId: "order-1", status: "confirmed", startsAt: null, legs: [], mirror: false });
    const res = await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.equal(res.ok, true);
    assert.equal(m.bookings.length, 1);
    assert.equal(talentMayCancel(m.bookings[0]!, TALENT).ok, true);
  });

  it("a leg that cannot be written takes the booking back", async () => {
    const m = memory({ window: WINDOW });
    m.store.ensureTalentLeg = async () => false;
    const res = await ensureOfferBooking(m.store, { orderId: "order-1" });
    assert.equal(res.ok, false);
    assert.equal(m.bookings.length, 0);
  });
});

describe("orderLinesFromOffer: the offer's own service lines", () => {
  it("keeps each line when they add up to the accepted total", () => {
    const lines = orderLinesFromOffer(
      [
        { label: "Cut", talent_profile_id: TALENT, total_price: "600.00" },
        { label: "Color", talent_profile_id: TALENT, total_price: 400 },
      ],
      100_000,
    );
    assert.deepEqual(lines.map((l) => [l.label, l.cents]), [["Cut", 60_000], ["Color", 40_000]]);
  });
  it("one line for the total when the lines do not add up", () => {
    const lines = orderLinesFromOffer([{ label: "Cut", talent_profile_id: null, total_price: 500 }], 100_000);
    assert.deepEqual(lines, [{ label: "Cut", cents: 100_000, talentProfileId: null }]);
  });
});

/** Minimal PostgREST fake for settleMoneyOnCancel: one open link, an unpaid order. */
function fakeMoneyAdmin(calls: string[]) {
  const rows: Record<string, unknown[]> = {
    payment_links: [{ id: "link-1", status: "open", order_id: "order-1", tenant_id: "t-1" }],
    orders: [{ id: "order-1", status: "pending_payment", tenant_id: "t-1" }],
    booking_transactions: [],
    order_collection_reservations: [],
  };
  const builder = (table: string, op: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const k of ["eq", "neq", "in", "is", "not", "order", "limit", "gte", "lt", "select", "or", "filter"]) b[k] = chain;
    const result = () => ({ data: op === "select" ? rows[table] ?? [] : rows[table]?.slice(0, 1) ?? [], error: null });
    b.maybeSingle = async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null });
    b.single = b.maybeSingle;
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
    return b;
  };
  return {
    from(table: string) {
      return {
        select: () => builder(table, "select"),
        update: () => (calls.push(`${table}.update`), builder(table, "update")),
        insert: () => builder(table, "insert"),
        delete: () => builder(table, "delete"),
      };
    },
    rpc: async () => ({ data: null, error: null }),
  };
}
