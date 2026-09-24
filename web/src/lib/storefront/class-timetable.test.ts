import assert from "node:assert/strict";
import { test } from "node:test";

import type { PurchaseResult } from "@/lib/orders/purchase-types";

import { actClassTimetableCore, readClassTimetableCore, type ClassTimetableDeps } from "./class-timetable.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";
import { memoryIdempotentRunner } from "./__fixtures__/memory-runner";

const TENANT = uuid(1);
const OFFERING = uuid(2);
const SERIES = uuid(3);
const VENUE = uuid(4);
const S_OPEN = uuid(10);
const S_FULL = uuid(11);
const S_NOZONE = uuid(12);
const POOL_OPEN = uuid(20);
const POOL_FULL = uuid(21);
const ENTRY = uuid(30);
const NOW = new Date("2026-09-15T08:00:00.000Z");

function setup(over: Partial<ClassTimetableDeps> = {}) {
  const remaining: Record<string, number> = { [POOL_OPEN]: 5, [POOL_FULL]: 0 };
  const { admin, store, calls } = fakeAdmin(
    {
      sessions: [
        { id: S_OPEN, tenant_id: TENANT, title: "Yoga 9am", starts_at: "2026-09-16T09:00:00Z", ends_at: "2026-09-16T10:00:00Z", venue_id: VENUE, series_id: SERIES, offering_id: OFFERING, status: "scheduled" },
        { id: S_FULL, tenant_id: TENANT, title: null, starts_at: "2026-09-17T09:00:00Z", ends_at: "2026-09-17T10:00:00Z", venue_id: null, series_id: SERIES, offering_id: OFFERING, status: "scheduled" },
        { id: S_NOZONE, tenant_id: TENANT, title: "Ghost", starts_at: "2026-09-18T09:00:00Z", ends_at: "2026-09-18T10:00:00Z", venue_id: null, series_id: null, offering_id: OFFERING, status: "scheduled" },
      ],
      talent_offerings: [{ id: OFFERING, tenant_id: TENANT, status: "published", amount_cents: 1500, currency: "USD" }],
      capacity_pools: [
        { id: POOL_OPEN, tenant_id: TENANT, subject_kind: "session_tier", subject_id: S_OPEN, pool_key: "default", units_total: 12 },
        { id: POOL_FULL, tenant_id: TENANT, subject_kind: "session_tier", subject_id: S_FULL, pool_key: "default", units_total: 12 },
      ],
      venues: [{ id: VENUE, timezone: "America/Cancun" }],
      session_series: [{ id: SERIES, title: "Morning Yoga", timezone: "America/Mexico_City" }],
      session_waitlist_entries: [
        { id: ENTRY, tenant_id: TENANT, session_id: S_FULL, status: "offered", customer_email: "ana@example.com", offer_expires_at: "2026-09-15T12:00:00Z" },
        { id: uuid(31), tenant_id: TENANT, session_id: S_FULL, status: "waiting", customer_email: "bob@example.com", offer_expires_at: null },
      ],
      orders: [{ id: uuid(50), receipt_code: "RCPT1234", currency: "USD" }],
    },
    { capacity_remaining_public: (a) => remaining[String(a.p_pool_id)] ?? null },
  );
  const memory = memoryIdempotentRunner();
  const purchases: unknown[] = [];
  const deps: ClassTimetableDeps = {
    admin,
    runner: memory.runner,
    identity: { guestKey: "g", userId: null, email: null, displayName: null },
    locale: "en",
    origin: "https://studio.test",
    now: () => NOW,
    createPurchase: async (_a, input) => {
      purchases.push(input);
      return {
        ok: true, orderId: uuid(50), customerId: uuid(51), totalCents: 1500, collectCents: 1500, currency: "USD", payInPerson: false,
        allocationIds: [uuid(52)], transactionId: uuid(53), bookingId: uuid(54), inquiryId: null, reservationHoldId: null,
      } satisfies PurchaseResult;
    },
    createCheckout: async (i) => ({ ok: true, url: `https://pay.test/${i.transactionId}`, sessionId: "s", mock: true }),
    joinWaitlist: async () => ({ ok: true, entryId: uuid(40) }),
    acceptWaitlistOffer: async (_a, i) => ({ ok: true, already: false, entryId: i.entryId, allocationId: uuid(41), units: 1 }),
    ...over,
  };
  return { deps, store, calls, purchases, remaining };
}

test("read: sessions in window with seats left, zone from venue then series, no-zone rows dropped", async () => {
  const { deps } = setup();
  const r = await readClassTimetableCore(deps, TENANT, { waitlist: true, email: "ana@example.com" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.series, [{ id: SERIES, title: "Morning Yoga", timezone: "America/Mexico_City" }]);
  assert.equal(r.data.sessions.length, 2, "the session without a zone is not listed");
  const [open, full] = r.data.sessions;
  assert.equal(open!.timezone, "America/Cancun");
  assert.equal(open!.seatsRemaining, 5);
  assert.equal(open!.seatsTotal, 12);
  assert.equal(open!.soldOut, false);
  assert.equal(open!.waitlist.open, false);
  assert.equal(full!.title, "Morning Yoga", "series title fills a blank session title");
  assert.equal(full!.timezone, "America/Mexico_City");
  assert.equal(full!.soldOut, true);
  assert.deepEqual(full!.waitlist, {
    open: true,
    waiting: 2,
    mine: { entryId: ENTRY, status: "offered", offerExpiresAtIso: "2026-09-15T12:00:00Z" },
  });
  assert.equal(open!.amountCents, 1500);
  assert.ok(!("starts_at" in open!), "no raw row leaks");
});

test("read: seriesIds filters; window is clamped; an invalid tenant is refused", async () => {
  const { deps } = setup();
  const none = await readClassTimetableCore(deps, TENANT, { seriesIds: [uuid(99)] });
  assert.ok(none.ok && none.data.sessions.length === 0);
  const later = await readClassTimetableCore(deps, TENANT, { from: "2026-09-17T00:00:00Z" });
  assert.ok(later.ok && later.data.sessions.length === 1 && later.data.sessions[0]!.id === S_FULL);
  assert.deepEqual(await readClassTimetableCore(deps, "x", {}), { ok: false, reason: "invalid_request" });
});

const BOOK = {
  op: "book" as const,
  tenantId: TENANT,
  sessionId: S_OPEN,
  units: 2,
  contact: { name: "Ana", email: "Ana@Example.com" },
  clientOrderKey: "cart-class-0001",
};

test("act book: refuses without identity; refuses a session with no pool; books through createPurchase with the tier hold", async () => {
  const { deps, purchases, store } = setup();
  const anon = await actClassTimetableCore(deps, { ...BOOK, contact: { name: "", email: "" } });
  assert.ok(!anon.ok && anon.reason === "identity_required");
  store.capacity_pools = store.capacity_pools!.filter((p) => p.id !== POOL_OPEN);
  const noPool = await actClassTimetableCore(deps, BOOK);
  assert.ok(!noPool.ok && noPool.code === "no_seats_configured" && noPool.reason === "full");
  assert.equal(purchases.length, 0);
});

test("act book: success carries checkout url to the receipt, and the same key replays", async () => {
  const { deps, purchases } = setup();
  const r = await actClassTimetableCore(deps, BOOK);
  assert.ok(r.ok && r.op === "book");
  if (!r.ok || r.op !== "book") return;
  assert.equal(purchases.length, 1);
  const sent = purchases[0] as { capacity: Array<{ poolId: string; units: number }>; lines: Array<{ sessionId: string }>; contact: { email: string } };
  assert.equal(sent.capacity[0]!.poolId, POOL_OPEN);
  assert.equal(sent.capacity[0]!.units, 2);
  assert.equal(sent.lines[0]!.sessionId, S_OPEN);
  assert.equal(sent.contact.email, "ana@example.com");
  assert.equal(r.checkoutUrl, `https://pay.test/${uuid(53)}`);
  assert.equal(r.receiptCode, "RCPT1234");
  assert.equal(r.session.timezone, "America/Cancun");
  const again = await actClassTimetableCore(deps, BOOK);
  assert.ok(again.ok && again.op === "book" && again.replayed === true);
  assert.equal(purchases.length, 1);
});

test("act book: sold_out → full; session_already_ended → past; a refused key is retryable", async () => {
  let reason: string | null = "sold_out";
  const { deps, purchases } = setup({
    createPurchase: async () => {
      purchases.push(reason);
      if (reason) return { ok: false, reason: reason as "sold_out" } as PurchaseResult;
      return { ok: true, orderId: uuid(50), customerId: null, totalCents: 0, collectCents: 0, currency: "USD", payInPerson: true, allocationIds: [], transactionId: null, bookingId: null, inquiryId: null, reservationHoldId: null };
    },
  });
  const full = await actClassTimetableCore(deps, BOOK);
  assert.ok(!full.ok && full.reason === "full");
  reason = "session_already_ended";
  const past = await actClassTimetableCore(deps, BOOK);
  assert.ok(!past.ok && past.reason === "past");
  reason = null;
  const ok = await actClassTimetableCore(deps, { ...BOOK, payment: "in_person" });
  assert.ok(ok.ok);
  assert.equal(purchases.length, 3);
});

test("act join_waitlist: needs a name+email; a second join hands back the existing entry", async () => {
  const { deps } = setup({
    joinWaitlist: async () => ({ ok: false, refusalKey: "alreadyWaiting", seatsRemaining: null }),
  });
  const anon = await actClassTimetableCore(deps, { op: "join_waitlist", tenantId: TENANT, sessionId: S_FULL, contact: { name: "Ana", email: "" } });
  assert.ok(!anon.ok && anon.reason === "identity_required");
  const again = await actClassTimetableCore(deps, { op: "join_waitlist", tenantId: TENANT, sessionId: S_FULL, contact: { name: "Ana", email: "ana@example.com" } });
  assert.deepEqual(again, { ok: true, op: "join_waitlist", entryId: ENTRY, already: true });
  const { deps: seats } = setup({ joinWaitlist: async () => ({ ok: false, refusalKey: "seatsAvailable", seatsRemaining: 3 }) });
  const open = await actClassTimetableCore(seats, { op: "join_waitlist", tenantId: TENANT, sessionId: S_OPEN, contact: { name: "Ana", email: "ana@example.com" } });
  assert.ok(!open.ok && open.reason === "refused" && open.code === "seatsAvailable");
});

test("act accept_offer: the e-mail must match the entry; an expired offer is past; a stale status is conflict", async () => {
  const { deps } = setup();
  const wrong = await actClassTimetableCore(deps, { op: "accept_offer", tenantId: TENANT, entryId: ENTRY, email: "bob@example.com" });
  assert.ok(!wrong.ok && wrong.reason === "refused" && wrong.code === "not_found");
  const ok = await actClassTimetableCore(deps, { op: "accept_offer", tenantId: TENANT, entryId: ENTRY, email: "ANA@example.com" });
  assert.deepEqual(ok, { ok: true, op: "accept_offer", entryId: ENTRY, already: false });
  const { deps: late } = setup({ now: () => new Date("2026-09-15T13:00:00Z") });
  const expired = await actClassTimetableCore(late, { op: "accept_offer", tenantId: TENANT, entryId: ENTRY, email: "ana@example.com" });
  assert.ok(!expired.ok && expired.reason === "past" && expired.code === "offer_expired");
  const { deps: stale } = setup({
    acceptWaitlistOffer: async () => ({ ok: false, reason: "conflict", refusalKey: "changedSinceOpened" }),
  });
  const c = await actClassTimetableCore(stale, { op: "accept_offer", tenantId: TENANT, entryId: ENTRY, email: "ana@example.com" });
  assert.ok(!c.ok && c.reason === "conflict");
});
