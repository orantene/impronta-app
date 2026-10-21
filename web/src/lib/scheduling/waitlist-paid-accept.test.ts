/**
 * TUL-1552: "accept from waitlist" on a PAID session must not hand out a seat
 * nobody paid for.
 *
 * Before: `acceptWaitlistOffer` went straight to `accept_session_waitlist_offer`,
 * which reserves, COMMITS the seat and marks the entry accepted. No order, no
 * payment. Both callers (the staff desk and the public class timetable) share it.
 *
 * After: a paid session goes through the orders gate (`createPurchase`), which
 * leaves a pending_payment order holding the seat on a TTL, and a pay link. The
 * entry stays `offered` until the order is paid; the paid hook then marks it
 * accepted against the order's committed seat. A free session keeps today's
 * direct commit.
 *
 * Driven through the storefront in-memory PostgREST. The two engines this layer
 * delegates to (`createPurchase`, Checkout) are injected fakes that write the
 * rows the real ones write, so what is asserted is the routing and the entry's
 * state, which belong to this layer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeAdmin, uuid, type FakeStore, type Row } from "@/lib/storefront/__fixtures__/fake-admin";
import type { PurchaseInput, PurchaseResult } from "@/lib/orders/purchase-types";
import type { CheckoutSessionInput, CheckoutSessionResult } from "@/lib/payments/stripe-checkout";
import { decideOrderExpiry } from "@/lib/orders/expire-orders";
import { acceptWaitlistOffer } from "./session-waitlist";

const TENANT = uuid(1);
const SESSION = uuid(2);
const OFFERING = uuid(3);
const POOL = uuid(4);
const ENTRY = uuid(5);
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function seed(amountCents: number | null, variantCents: ReadonlyArray<number | null> = []): FakeStore {
  return {
    session_waitlist_entries: [
      {
        id: ENTRY, tenant_id: TENANT, session_id: SESSION, status: "offered",
        customer_name: "Ana", customer_email: "ana@example.com", party_size: 2,
        offered_at: iso(NOW - 60_000), offer_expires_at: iso(NOW + 30 * 60_000),
        accepted_allocation_id: null, decided_at: null,
      },
    ],
    sessions: [
      {
        id: SESSION, tenant_id: TENANT, offering_id: OFFERING, status: "scheduled",
        title: "Pilates", starts_at: iso(NOW + 86_400_000), ends_at: iso(NOW + 90_000_000),
      },
    ],
    talent_offerings: [{ id: OFFERING, tenant_id: TENANT, amount_cents: amountCents, price_type: "fixed", currency: "MXN" }],
    talent_offering_variants: variantCents.map((cents, i) => ({ id: uuid(70 + i), offering_id: OFFERING, amount_cents: cents })),
    capacity_pools: [{ id: POOL, tenant_id: TENANT, subject_kind: "session_tier", subject_id: SESSION, pool_key: "default" }],
    capacity_allocations: [],
    orders: [],
    order_lines: [],
    customers: [{ id: uuid(9), tenant_id: TENANT, email: "ana@example.com" }],
  };
}

/** Today's RPC, modelled: reserve + COMMIT a seat and mark the entry accepted. */
function acceptRpc(store: FakeStore) {
  return () => {
    const entry = store.session_waitlist_entries[0];
    const alloc: Row = { id: uuid(40), tenant_id: TENANT, pool_id: POOL, order_line_id: null, state: "committed", units: entry.party_size };
    store.capacity_allocations.push(alloc);
    Object.assign(entry, { status: "accepted", accepted_allocation_id: alloc.id, decided_at: iso(NOW) });
    return { ok: true, already: false, entry_id: entry.id, allocation_id: alloc.id, units: entry.party_size };
  };
}

/** `createPurchase`, modelled: a pending_payment order whose seat is a HOLD on a TTL. */
function fakePurchase(store: FakeStore, calls: PurchaseInput[]) {
  return async (_admin: unknown, input: PurchaseInput): Promise<PurchaseResult> => {
    calls.push(input);
    const orderId = uuid(60);
    const lineId = uuid(61);
    store.orders.push({
      id: orderId, tenant_id: TENANT, status: "pending_payment", customer_id: uuid(9),
      source_channel: input.sourceChannel, currency: "MXN", receipt_code: "RCPT1234",
      // The pipeline takes the hold TTL from the leg when one is given (else the pool's 15 min).
      hold_expires_at: iso(NOW + (input.capacity?.[0]?.ttlSeconds ?? 900) * 1000), created_at: iso(NOW), updated_at: iso(NOW),
    });
    store.order_lines.push({ id: lineId, order_id: orderId, session_id: input.lines[0]?.sessionId ?? null });
    store.capacity_allocations.push({
      id: uuid(62), tenant_id: TENANT, pool_id: POOL, order_line_id: lineId, state: "hold",
      units: input.capacity?.[0]?.units ?? 1, expires_at: iso(NOW + (input.capacity?.[0]?.ttlSeconds ?? 900) * 1000),
    });
    return {
      ok: true, orderId, inquiryId: null, customerId: uuid(9), totalCents: 50000, collectCents: 50000,
      currency: "MXN", payInPerson: false, allocationIds: [uuid(62)], transactionId: uuid(63),
      bookingId: uuid(64), reservationHoldId: null,
    };
  };
}

function setup(amountCents: number | null, variantCents: ReadonlyArray<number | null> = []) {
  const store = seed(amountCents, variantCents);
  const db = fakeAdmin(store, { accept_session_waitlist_offer: acceptRpc(store) });
  const purchases: PurchaseInput[] = [];
  const checkouts: CheckoutSessionInput[] = [];
  const charge = {
    createPurchase: fakePurchase(store, purchases),
    createCheckout: async (input: CheckoutSessionInput): Promise<CheckoutSessionResult> => {
      checkouts.push(input);
      return { ok: true, url: "https://checkout.stripe.test/c/pay_1", sessionId: "cs_test_1" };
    },
    origin: "https://studio.example.com",
    locale: "es" as const,
    channel: "staff" as const,
  };
  const input = { tenantId: TENANT, entryId: ENTRY, actorUserId: uuid(7), expectedStatus: "offered" as const };
  return { store, db, purchases, checkouts, charge, input };
}

const committed = (s: FakeStore) => s.capacity_allocations.filter((a) => a.state === "committed");

test("(a) staff accept on a PAID session: no committed seat, entry not accepted, a pending_payment order holds it", async () => {
  const { store, db, purchases, checkouts, charge, input } = setup(25000);
  const result = await acceptWaitlistOffer(db.admin as never, input, charge);

  assert.equal(committed(store).length, 0, "an unpaid accept must never commit a seat");
  assert.equal(store.session_waitlist_entries[0].status, "offered", "the entry is not accepted before payment");
  assert.equal(db.calls.some((c) => c.rpc === "accept_session_waitlist_offer"), false, "the commit RPC is not used for a paid session");

  assert.equal(purchases.length, 1, "the purchase goes through the orders gate");
  const p = purchases[0];
  assert.equal(p.lines[0]?.sessionId, SESSION);
  assert.equal(p.lines[0]?.units, 2, "the whole party");
  assert.equal(p.capacity?.[0]?.poolId, POOL);
  assert.equal(p.contact.email, "ana@example.com", "the order is the guest's, not the operator's");
  assert.equal(p.sourceChannel, "waitlist");
  assert.equal(p.clientOrderKey, `waitlist:${ENTRY}`, "a second click replays the same order");
  assert.equal(store.orders[0]?.status, "pending_payment");
  assert.equal(store.capacity_allocations[0]?.state, "hold");

  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.ok(result.payment, "the caller is told payment is pending");
  assert.equal(result.payment?.payUrl, "https://checkout.stripe.test/c/pay_1");
  assert.equal(result.payment?.holdExpiresAt, store.orders[0]?.hold_expires_at);
  assert.equal(checkouts[0]?.currency, "MXN", "charged in the order's currency");
  assert.equal(checkouts[0]?.amountCents, 50000);
});

test("(b) the hold lapses: the order is swept, the seat goes back, the entry is never accepted", async () => {
  const { store, db, charge, input } = setup(25000);
  await acceptWaitlistOffer(db.admin as never, input, charge);
  const order = store.orders[0];
  assert.ok(order, "a held order exists");
  const later = new Date(Date.parse(String(order.hold_expires_at)) + 60_000);
  const decision = decideOrderExpiry(
    { id: String(order.id), status: String(order.status), holdExpiresAt: String(order.hold_expires_at), createdAt: String(order.created_at), updatedAt: null },
    later,
  );
  assert.equal(decision.action, "cancel", "the sweep cancels the unpaid order");
  // The seat is a HOLD, so the capacity reaper frees it; a committed seat would
  // stay taken forever.
  assert.equal(store.capacity_allocations[0]?.state, "hold");
  Object.assign(order, { status: "cancelled" });
  store.capacity_allocations[0]!.state = "released";

  const { acceptWaitlistEntriesForPaidOrder } = await import("./waitlist-charge");
  await acceptWaitlistEntriesForPaidOrder(db.admin as never, {
    orderId: String(order.id), tenantId: TENANT, lines: [{ id: String(store.order_lines[0]?.id), sessionId: SESSION }],
  });
  assert.equal(store.session_waitlist_entries[0].status, "offered", "a cancelled order never accepts the entry");
  assert.equal(committed(store).length, 0);
});

test("(c) the order is paid: the seat is committed once and the entry is accepted against it", async () => {
  const { store, db, charge, input } = setup(25000);
  await acceptWaitlistOffer(db.admin as never, input, charge);
  const order = store.orders[0]!;
  // completeOrderForTransaction commits the held seat and flips the order.
  Object.assign(order, { status: "paid", hold_expires_at: null });
  store.capacity_allocations[0]!.state = "committed";

  const { acceptWaitlistEntriesForPaidOrder } = await import("./waitlist-charge");
  const ctx = { orderId: String(order.id), tenantId: TENANT, lines: [{ id: String(store.order_lines[0]?.id), sessionId: SESSION }] };
  await acceptWaitlistEntriesForPaidOrder(db.admin as never, ctx);
  await acceptWaitlistEntriesForPaidOrder(db.admin as never, ctx); // webhook redelivery

  const entry = store.session_waitlist_entries[0];
  assert.equal(entry.status, "accepted");
  assert.equal(entry.accepted_allocation_id, uuid(62), "the entry names the order's own seat");
  assert.equal(committed(store).length, 1, "exactly one committed seat");
  assert.equal(db.calls.some((c) => c.rpc === "commit_capacity" || c.rpc === "accept_session_waitlist_offer"), false, "no second commit");
});

test("(c, wiring) the Stripe paid seam runs the waitlist acceptance before the mint's early return", () => {
  const src = readFileSync(join(process.cwd(), "src", "lib", "events", "mint-and-deliver.ts"), "utf8");
  const accept = src.indexOf("await acceptWaitlistEntriesForPaidOrder(admin, ctx)");
  const mint = src.indexOf("await mintAdmissionsForPaidOrder(admin, ctx)");
  assert.ok(accept > 0, "mintAndDeliverForPaidOrder (the webhook's onOrderPaid) must accept paid waitlist entries");
  assert.ok(accept < mint, "before the mint, so its early return cannot skip it");
});

test("(d) FREE session: direct commit, exactly as today", async () => {
  const { store, db, purchases, charge, input } = setup(0);
  const result = await acceptWaitlistOffer(db.admin as never, input, charge);
  assert.equal(result.ok, true);
  assert.equal(purchases.length, 0, "no order for a free place");
  assert.equal(store.session_waitlist_entries[0].status, "accepted");
  assert.equal(committed(store).length, 1);
  if (result.ok) assert.equal(result.payment, undefined);
});

test("a PAID session with no way to charge refuses, never commits unpaid (fail closed)", async () => {
  const { store, db, input } = setup(25000);
  const result = await acceptWaitlistOffer(db.admin as never, input);
  assert.equal(result.ok, false);
  assert.equal(committed(store).length, 0);
  assert.equal(store.session_waitlist_entries[0].status, "offered");
});

test("an unreadable price refuses, never commits (fail closed)", async () => {
  const { store, charge, input } = setup(25000);
  const db = fakeAdmin(store, { accept_session_waitlist_offer: acceptRpc(store) });
  type Failing = { select: () => Failing; eq: () => Failing; maybeSingle: () => Promise<{ data: null; error: { code: string; message: string } }> };
  const failing: Failing = {
    select: () => failing,
    eq: () => failing,
    maybeSingle: async () => ({ data: null, error: { code: "57014", message: "timeout" } }),
  };
  const broken = {
    from: (table: string) => (table === "talent_offerings" ? failing : db.admin.from(table)),
    rpc: db.admin.rpc,
  };
  const result = await acceptWaitlistOffer(broken as never, input, charge);
  assert.equal(result.ok, false);
  assert.equal(committed(store).length, 0);
});

/* ── PM review of #4213 ────────────────────────────────────────────────────── */

test("a session priced only by VARIANT (base 0, tier > 0) is not free: no committed seat, refused as ambiguous", async () => {
  const { store, db, purchases, charge, input } = setup(0, [0, 3000]);
  const result = await acceptWaitlistOffer(db.admin as never, input, charge);
  assert.equal(committed(store).length, 0, "a priced tier must never be handed out as free");
  assert.equal(store.session_waitlist_entries[0].status, "offered");
  assert.equal(purchases.length, 0, "the place has no single price to charge, so nothing is opened");
  assert.equal(result.ok, false);
});

test("a base price with NO amount (null) is not a definite 0: refused, never committed", async () => {
  const { store, db, charge, input } = setup(null);
  const result = await acceptWaitlistOffer(db.admin as never, input, charge);
  assert.equal(result.ok, false);
  assert.equal(committed(store).length, 0);
});

test("unreadable variants refuse (fail closed), never commit", async () => {
  const { store, charge, input } = setup(0);
  const db = fakeAdmin(store, { accept_session_waitlist_offer: acceptRpc(store) });
  type Reply = { data: null; error: { code: string; message: string } };
  type Failing = { select: () => Failing; eq: () => Failing; in: () => Failing; then: (r: (v: Reply) => unknown) => unknown };
  const failing: Failing = {
    select: () => failing,
    eq: () => failing,
    in: () => failing,
    then: (r) => r({ data: null, error: { code: "57014", message: "timeout" } }),
  };
  const broken = {
    from: (table: string) => (table === "talent_offering_variants" ? failing : db.admin.from(table)),
    rpc: db.admin.rpc,
  };
  const result = await acceptWaitlistOffer(broken as never, input, charge);
  assert.equal(result.ok, false);
  assert.equal(committed(store).length, 0);
});

test("free still means free: base 0 and every variant 0 commits directly", async () => {
  const { store, db, purchases, charge, input } = setup(0, [0, 0]);
  const result = await acceptWaitlistOffer(db.admin as never, input, charge);
  assert.equal(result.ok, true);
  assert.equal(purchases.length, 0);
  assert.equal(committed(store).length, 1);
});

test("the hold matches the offer window, and Checkout closes before the hold does", async () => {
  const { store, db, purchases, checkouts, charge, input } = setup(25000);
  const mod = await import("./waitlist-charge");
  const holdSeconds = (mod as { WAITLIST_HOLD_SECONDS?: number }).WAITLIST_HOLD_SECONDS;
  const marginSeconds = (mod as { WAITLIST_CHECKOUT_MARGIN_SECONDS?: number }).WAITLIST_CHECKOUT_MARGIN_SECONDS;
  await acceptWaitlistOffer(db.admin as never, input, charge);
  assert.ok(typeof holdSeconds === "number" && holdSeconds >= 30 * 60, "the hold covers the 30-minute offer window");
  assert.equal(purchases[0]?.capacity?.[0]?.ttlSeconds, holdSeconds, "the order holds for the offer window, not the pool's 15 min");
  const holdEnd = Date.parse(String(store.orders[0]?.hold_expires_at));
  const checkoutEnd = Date.parse(String(checkouts[0]?.expiresAt));
  assert.ok(Number.isFinite(checkoutEnd), "the Checkout session is given an expiry");
  assert.equal(holdEnd - checkoutEnd, (marginSeconds ?? NaN) * 1000, "nobody can pay after the seat is gone");
  assert.ok(checkoutEnd - Date.now() >= 30 * 60_000, "Stripe's 30-minute minimum is met");
});
