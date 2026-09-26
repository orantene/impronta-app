import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cancelPaymentLink, createPaymentLink, markPaymentLinkPaid, mockPaymentsAllowed, paymentLinkProvider } from "./links";
import { openPaymentLinkCheckout } from "./link-checkout";
import { closePaidPaymentLink, closePaymentLinkForClosedCheckout, PAYMENT_LINK_METADATA_KEY } from "./link-settlement";
import type { CheckoutSessionInput } from "./stripe-checkout";
import { fakeAdmin, makeStore, type Row } from "@/lib/pos/__fixtures__/pos-store";

/**
 * Audit 2026-09-25, defects #1-#3: a Stripe payment link charged the customer
 * and settled nothing. These tests hold the replacement: the link opens a real
 * money row, the session names it and dies with the link, `markPaid` closes the
 * link, and mock money is refused on production.
 */

const STRIPE_ENV = { STRIPE_SECRET_KEY: "sk_test_fixture" };
const SUCCESS = "https://qa.example/pay/CODE?status=paid";
const CANCEL = "https://qa.example/pay/CODE";

function tables(store: ReturnType<typeof makeStore>): Record<string, Row[]> {
  return store as unknown as Record<string, Row[]>;
}

async function mintStripeLink(store: ReturnType<typeof makeStore>) {
  store.orders.push({ id: "o1", tenant_id: "t1", status: "pending_payment", currency: "USD", total_cents: 5000, version: 1, inquiry_id: null, customer_id: null });
  const admin = fakeAdmin(store);
  const minted = await createPaymentLink(admin, {
    tenantId: "t1",
    orderId: "o1",
    amountCents: 1800,
    idempotencyKey: "msg-request-stripe-1",
    actorUserId: "0f3c6b7a-2d1e-4c5b-9a8f-7e6d5c4b3a21",
    publicOrigin: "https://qa.example",
    env: STRIPE_ENV,
  });
  assert.equal(minted.ok, true, JSON.stringify(minted));
  if (!minted.ok) throw new Error("mint failed");
  const link = tables(store).payment_links.find((l) => l.code === minted.code)!;
  assert.equal(link.provider, "stripe");
  return { admin, code: minted.code, link };
}

function fakeStripe(sessionId = "cs_test_link_1") {
  const created: CheckoutSessionInput[] = [];
  const retrieved: string[] = [];
  const url = `https://checkout.stripe.com/c/pay/${sessionId}`;
  return {
    created,
    retrieved,
    url,
    deps: {
      createCheckoutSession: async (input: CheckoutSessionInput) => {
        created.push(input);
        return { ok: true as const, url, sessionId };
      },
      retrieveCheckoutSession: async (id: string) => {
        retrieved.push(id);
        return { ok: true as const, status: "open", url };
      },
    },
  };
}

test("a Stripe link opens ONE money row bound to its claim, and the session names it and dies with the link", async () => {
  const store = makeStore();
  const { admin, code, link } = await mintStripeLink(store);
  const stripe = fakeStripe();

  const opened = await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps);
  assert.deepEqual(opened, { ok: true, url: stripe.url });

  const txns = store.booking_transactions;
  assert.equal(txns.length, 1);
  const txn = txns[0];
  assert.equal(txn.provider, "stripe");
  assert.equal(txn.status, "payment_requested");
  assert.equal(txn.order_id, "o1");
  assert.equal(txn.gross_amount_cents, 1800);
  const meta = txn.metadata as Record<string, string>;
  assert.equal(meta[PAYMENT_LINK_METADATA_KEY], link.id);
  assert.equal(meta.collection_reservation_id, link.reservation_id);
  assert.equal(meta.collection_payment_request_id, "cs_test_link_1");

  const claim = store.order_collection_reservations.find((r) => r.id === link.reservation_id)!;
  assert.equal(claim.transaction_id, txn.id, "the claim knows its money row before any session exists");

  assert.equal(stripe.created.length, 1);
  const session = stripe.created[0];
  assert.equal(session.transactionId, txn.id, "client_reference_id routes the webhook to markPaid");
  assert.equal(session.amountCents, 1800);
  assert.equal(session.metadata?.payment_link_code, code);
  assert.equal(session.expiresAt, link.expires_at, "the session expires with the link");
  assert.equal(session.expiresAt, claim.expires_at, "...and with the claim the reaper releases");
  assert.equal(store.orders[0].status, "pending_payment");
});

test("a second tap resumes the same session: no second money row, no second Checkout", async () => {
  const store = makeStore();
  const { admin, code } = await mintStripeLink(store);
  const stripe = fakeStripe();

  const first = await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps);
  const second = await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps);
  assert.deepEqual(first, second);
  assert.equal(stripe.created.length, 1, "the resume asks Stripe for the existing session instead");
  assert.deepEqual(stripe.retrieved, ["cs_test_link_1"]);
  assert.equal(store.booking_transactions.length, 1);
});

test("a paid money row sends a returning customer to the paid view, never to a new session", async () => {
  const store = makeStore();
  const { admin, code } = await mintStripeLink(store);
  const stripe = fakeStripe();
  await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps);
  store.booking_transactions[0].status = "paid";

  const again = await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps);
  assert.deepEqual(again, { ok: true, url: SUCCESS });
  assert.equal(stripe.created.length, 1);
});

test("opened with under 31 minutes left, the claim and the link move out TOGETHER so Stripe accepts the expiry", async () => {
  const store = makeStore();
  const { admin, code, link } = await mintStripeLink(store);
  const now = Date.now();
  const soon = new Date(now + 10 * 60_000).toISOString();
  link.expires_at = soon;
  const claim = store.order_collection_reservations.find((r) => r.id === link.reservation_id)!;
  claim.expires_at = soon;
  const stripe = fakeStripe();

  const opened = await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, { ...stripe.deps, now: () => now });
  assert.equal(opened.ok, true);
  const sessionExpiry = stripe.created[0].expiresAt!;
  assert.ok(Date.parse(sessionExpiry) - now >= 1800_000, `Stripe refuses under 30 minutes, got ${sessionExpiry}`);
  assert.equal(link.expires_at, sessionExpiry);
  assert.equal(claim.expires_at, sessionExpiry);
});

test("a mock or lapsed link never reaches Checkout", async () => {
  const store = makeStore();
  const { admin, code, link } = await mintStripeLink(store);
  const stripe = fakeStripe();

  link.expires_at = new Date(Date.now() - 1000).toISOString();
  assert.deepEqual(await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps), {
    ok: false,
    reason: "expired",
  });
  link.expires_at = new Date(Date.now() + 60 * 60_000).toISOString();
  link.provider = "mock";
  assert.deepEqual(await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps), {
    ok: false,
    reason: "provider_unavailable",
  });
  assert.equal(stripe.created.length, 0);
  assert.equal(store.booking_transactions.length, 0);
});

test("cancelling a link kills its Checkout session before the balance goes back", async () => {
  const store = makeStore();
  const { admin, code, link } = await mintStripeLink(store);
  await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, fakeStripe().deps);
  const expired: string[] = [];

  const result = await cancelPaymentLink(admin, { tenantId: "t1", linkId: String(link.id) }, {
    expireSession: async (id) => {
      expired.push(id);
      return { ok: true, already: false };
    },
  });
  assert.deepEqual(result, { ok: true, already: false });
  assert.deepEqual(expired, ["cs_test_link_1"]);
  assert.equal(link.status, "cancelled");
  assert.equal(store.order_collection_reservations[0].state, "released");
});

// GAP-JOR-4: remint must mark the prior open link replaced (not merely cancelled).
test("cancelPaymentLink asReplaced writes status=replaced", async () => {
  const store = makeStore();
  const { admin, code, link } = await mintStripeLink(store);
  await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, fakeStripe().deps);

  const result = await cancelPaymentLink(
    admin,
    { tenantId: "t1", linkId: String(link.id), asReplaced: true },
    { expireSession: async () => ({ ok: true, already: false }) },
  );
  assert.deepEqual(result, { ok: true, already: false });
  assert.equal(link.status, "replaced");
});

test("cancelling a link whose session already completed says paid, and gives nothing back", async () => {
  const store = makeStore();
  const { admin, code, link } = await mintStripeLink(store);
  await openPaymentLinkCheckout(admin, { code, successUrl: SUCCESS, cancelUrl: CANCEL }, fakeStripe().deps);

  const result = await cancelPaymentLink(admin, { tenantId: "t1", linkId: String(link.id) }, {
    expireSession: async () => ({ ok: false, reason: "complete" }),
  });
  assert.deepEqual(result, { ok: false, reason: "already_paid" });
  assert.equal(link.status, "open");
  assert.equal(store.order_collection_reservations[0].state, "reserved");
});

// ─── settle: markPaid closes the link, once ────────────────────────────────────

test("the same payment settling twice closes the link once", async () => {
  const store = makeStore();
  tables(store).payment_links = [{ id: "link-1", tenant_id: "t1", order_id: "o1", status: "open" }];
  const admin = fakeAdmin(store);

  const first = await closePaidPaymentLink(admin, { linkId: "link-1", transactionId: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61" });
  const second = await closePaidPaymentLink(admin, { linkId: "link-1", transactionId: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61" });
  assert.deepEqual(first, { ok: true, already: false });
  assert.deepEqual(second, { ok: true, already: true });
  assert.equal(tables(store).payment_links[0].status, "paid");
});

test("money that lands after the link lapsed still reads paid (the charge happened)", async () => {
  const store = makeStore();
  tables(store).payment_links = [{ id: "link-1", tenant_id: "t1", order_id: "o1", status: "expired" }];
  const result = await closePaidPaymentLink(fakeAdmin(store), { linkId: "link-1", transactionId: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61" });
  assert.deepEqual(result, { ok: true, already: false });
  assert.equal(tables(store).payment_links[0].status, "paid");
});

// ─── expiry: checkout.session.expired closes the link ─────────────────────────

function expiringLinkStore(txnStatus: string, withLink = true) {
  const store = makeStore();
  store.order_collection_reservations.push({ id: "res-1", order_id: "o1", tenant_id: "t1", state: "reserved", amount_cents: 1800, transaction_id: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61", expires_at: new Date(Date.now() + 60_000).toISOString() });
  store.booking_transactions.push({
    id: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61",
    status: txnStatus,
    metadata: { collection_reservation_id: "res-1", ...(withLink ? { [PAYMENT_LINK_METADATA_KEY]: "link-1" } : {}) },
  });
  tables(store).payment_links = [{ id: "link-1", tenant_id: "t1", order_id: "o1", status: "open", reservation_id: "res-1" }];
  const failed: Array<[string, string]> = [];
  const markFailed = async (id: string, reason: string) => {
    failed.push([id, reason]);
    const row = store.booking_transactions.find((t) => t.id === id)!;
    row.status = "failed";
    return { ok: true };
  };
  return { store, admin: fakeAdmin(store), failed, markFailed };
}

test("an expired session fails the row, gives the balance back and expires the link, once", async () => {
  const { store, admin, failed, markFailed } = expiringLinkStore("payment_requested");

  const first = await closePaymentLinkForClosedCheckout(admin, { transactionId: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61", reason: "expired" }, { markFailed });
  assert.deepEqual(first, { ok: true, outcome: "expired" });
  assert.deepEqual(failed, [["7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61", "checkout_expired"]]);
  assert.equal(store.order_collection_reservations[0].state, "released");
  assert.equal(tables(store).payment_links[0].status, "expired");

  const replay = await closePaymentLinkForClosedCheckout(admin, { transactionId: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61", reason: "expired" }, { markFailed });
  assert.deepEqual(replay, { ok: true, outcome: "already_settled" });
  assert.equal(failed.length, 1);
});

test("an expiry that arrives after the money landed changes nothing", async () => {
  const { store, admin, failed, markFailed } = expiringLinkStore("paid");
  const result = await closePaymentLinkForClosedCheckout(admin, { transactionId: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61", reason: "expired" }, { markFailed });
  assert.deepEqual(result, { ok: true, outcome: "already_settled" });
  assert.equal(failed.length, 0);
  assert.equal(store.order_collection_reservations[0].state, "reserved");
  assert.equal(tables(store).payment_links[0].status, "open");
});

test("a session that is not a payment link's is left to its own owner", async () => {
  const { store, admin, failed, markFailed } = expiringLinkStore("payment_requested", false);
  const result = await closePaymentLinkForClosedCheckout(admin, { transactionId: "7d3c1c1e-5b1a-4a0e-9f4b-1c2d3e4f5a61", reason: "expired" }, { markFailed });
  assert.deepEqual(result, { ok: true, outcome: "skipped" });
  assert.equal(failed.length, 0);
  assert.equal(store.booking_transactions[0].status, "payment_requested");
});

test("a session id that is not one of our money rows is skipped, not retried", async () => {
  const { admin, failed, markFailed } = expiringLinkStore("payment_requested");
  const result = await closePaymentLinkForClosedCheckout(admin, { transactionId: "usr_123", reason: "expired" }, { markFailed });
  assert.deepEqual(result, { ok: true, outcome: "skipped" });
  assert.equal(failed.length, 0);
});

// ─── mock money is refused on production ───────────────────────────────────────

test("production never mints a mock link, and holds no balance trying", async () => {
  assert.equal(mockPaymentsAllowed({ VERCEL_ENV: "production" }), false);
  assert.equal(mockPaymentsAllowed({ VERCEL_ENV: "preview" }), true);
  assert.equal(paymentLinkProvider({ VERCEL_ENV: "production" }), null);
  assert.equal(paymentLinkProvider({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_live_x" }), "stripe");
  assert.equal(paymentLinkProvider({}), "mock");

  const store = makeStore();
  store.orders.push({ id: "o1", tenant_id: "t1", status: "pending_payment", currency: "USD", total_cents: 5000, version: 1, inquiry_id: null });
  const refused = await createPaymentLink(fakeAdmin(store), {
    tenantId: "t1",
    orderId: "o1",
    amountCents: 1800,
    idempotencyKey: "msg-request-prod-1",
    actorUserId: null,
    publicOrigin: "https://qa.example",
    env: { VERCEL_ENV: "production" },
  });
  assert.deepEqual(refused, { ok: false, reason: "provider_unavailable" });
  assert.equal(store.order_collection_reservations.length, 0);
});

test("?confirm=mock settles nothing on production, and never settles a Stripe link anywhere", async () => {
  const link = {
    id: "link-1",
    tenant_id: "t1",
    order_id: "o1",
    amount_cents: 1800,
    currency: "usd",
    provider: "mock",
    created_by: null,
    operation_key: "k",
    status: "open",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    reservation_id: "res-1",
  };
  const admin = (row: Record<string, unknown>) => ({
    from: () => {
      const api = { select: () => api, eq: () => api, maybeSingle: async () => ({ data: row, error: null }) };
      return api;
    },
  });
  let settles = 0;
  const settle = async () => {
    settles += 1;
    return { ok: false as const, reason: "unavailable" as const };
  };

  const onProd = await markPaymentLinkPaid(admin(link) as never, { code: "abcdefgh" }, { settle, env: { VERCEL_ENV: "production" } });
  assert.deepEqual(onProd, { ok: false, reason: "unavailable" });
  const stripeLink = await markPaymentLinkPaid(admin({ ...link, provider: "stripe" }) as never, { code: "abcdefgh" }, { settle, env: {} });
  assert.deepEqual(stripeLink, { ok: false, reason: "unavailable" });
  assert.equal(settles, 0);
});

// ─── wiring guards ─────────────────────────────────────────────────────────────

test("the pay page opens Checkout through the link's money row, never a bare session", () => {
  const page = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/page.tsx"), "utf8");
  assert.doesNotMatch(page, /checkout\.sessions\.create/);
  assert.match(page, /openPaymentLinkCheckout\(/);
  assert.match(page, /mockPaymentsAllowed\(\)/);
});

test("markPaid is what closes a paid link", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/bookings/transactions.ts"), "utf8");
  assert.match(src, /closePaidPaymentLink\(sbOrders/);
});
