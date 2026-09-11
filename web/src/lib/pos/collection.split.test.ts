import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addLine, createDraftOrder } from "./draft";
import { finalizeOrCancel, recordVerifiedCollection, startCollection } from "./collection";
import { settleAtDoor } from "@/lib/orders/settle-at-door";
import { fakeAdmin, fakeDraftAdmin, makeStore, type Row } from "./__fixtures__/pos-store";
import {
  RESERVATION_TTL_SECONDS,
  STRIPE_CHECKOUT_MIN_TTL_SECONDS,
  reservationTtlSeconds,
} from "./collection-reservations";

function seedOffering(store: ReturnType<typeof makeStore>, over: Partial<Row> = {}) {
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    title: "Table for two",
    amount_cents: 9000,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
    ...over,
  });
}

const contact = { email: "split@example.com" };
const urls = { successUrl: "https://app.test/ok", cancelUrl: "https://app.test/no" };
const named = {
  ensureCustomer: async () => ({
    ok: true as const,
    customerId: "cust-split",
    created: true,
    identity: { email: "split@example.com", phoneE164: null, displayName: null },
  }),
};

async function openNineThousand() {
  const store = makeStore();
  seedOffering(store);
  const created = await createDraftOrder(fakeDraftAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return store;
  await addLine(fakeDraftAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  return store;
}

test("three cash allocations on one order leave it unpaid until the third, then refuse a fourth", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const admin = fakeAdmin(store);
  const keys = ["pos-cash:a", "pos-cash:b", "pos-cash:c"];
  for (const [i, key] of keys.entries()) {
    const r = await startCollection(
      admin,
      {
        tenantId: "t1",
        orderId,
        actorUserId: "u1",
        method: "cash",
        contact,
        ...urls,
        amountCents: 3000,
        idempotencyKey: key,
      },
      { ...named, settle: settleAtDoor },
    );
    assert.equal(r.ok, true, `allocation ${i + 1}`);
    if (!r.ok || r.method !== "cash") return;
    assert.equal(r.alreadySettled, false);
    assert.equal(r.amountCents, 3000);
    assert.equal(store.orders.length, 1);
    if (i < 2) {
      assert.equal(store.orders[0].status, "draft");
      assert.equal(r.outstandingAfterCents, 6000 - i * 3000);
    }
  }
  assert.equal(store.booking_transactions.filter((t) => t.status === "paid").length, 3);
  assert.equal(store.orders[0].status, "paid");
  const fourth = await startCollection(
    admin,
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "pos-cash:d",
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(fourth.ok, false);
  if (fourth.ok) return;
  assert.equal(fourth.reason, "not_draft");
  assert.equal(store.booking_transactions.filter((t) => t.status === "paid").length, 3);
  assert.equal(store.orders.length, 1);
});

test("equal splits use distinct idempotency keys and do not collide", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const first = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "pos-cash:same-amount:1",
    },
    { ...named, settle: settleAtDoor },
  );
  const second = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "pos-cash:same-amount:2",
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(store.booking_transactions.length, 2);
  assert.notEqual(
    store.booking_transactions[0].provider_reference,
    store.booking_transactions[1].provider_reference,
  );
});

test("the same cash idempotency key does not write a second allocation", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const input = {
    tenantId: "t1",
    orderId,
    actorUserId: "u1" as const,
    method: "cash" as const,
    contact,
    ...urls,
    amountCents: 3000,
    idempotencyKey: "pos-cash:retry",
  };
  const first = await startCollection(fakeAdmin(store), input, { ...named, settle: settleAtDoor });
  const second = await startCollection(fakeAdmin(store), input, { ...named, settle: settleAtDoor });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!second.ok || second.method !== "cash") return;
  assert.equal(second.alreadySettled, true);
  assert.equal(store.booking_transactions.length, 1);
  assert.equal(store.order_collection_reservations.length, 1, "one key, one claim");
  assert.equal(store.order_collection_reservations[0].state, "settled");
  assert.equal(
    second.transactionId,
    store.booking_transactions[0].id,
    "the replay answers with the transaction the first attempt recorded",
  );
});

test("an allocation larger than outstanding is refused", async () => {
  const store = await openNineThousand();
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 9001,
      idempotencyKey: "pos-cash:too-much",
    },
    named,
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "amount");
  assert.equal(store.booking_transactions.length, 0);
});

test("tendered below the allocation is refused and does not write", async () => {
  const store = await openNineThousand();
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      tenderedCents: 2999,
      idempotencyKey: "pos-cash:short",
    },
    named,
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "tendered");
  assert.equal(store.booking_transactions.length, 0);
});

test("change is tendered minus the allocation, not a second order", async () => {
  const store = await openNineThousand();
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      tenderedCents: 5000,
      idempotencyKey: "pos-cash:change",
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(r.ok, true);
  if (!r.ok || r.method !== "cash") return;
  assert.equal(r.changeCents, 2000);
  assert.equal(r.amountCents, 3000);
  assert.equal(store.orders.length, 1);
  assert.equal(store.orders[0].status, "draft");
  const meta = store.booking_transactions[0].metadata as { tendered_cents: number; change_cents: number };
  assert.equal(meta.tendered_cents, 5000);
  assert.equal(meta.change_cents, 2000);
  assert.equal(store.booking_transactions[0].gross_amount_cents, 3000);
});

test("two tills collecting the full outstanding leave exactly one refused on amount", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const till = (key: string) =>
    startCollection(
      fakeAdmin(store),
      {
        tenantId: "t1",
        orderId,
        actorUserId: "u1",
        method: "cash",
        contact,
        ...urls,
        // No amount: each till asks for "everything still owed", which is the
        // shape that used to let both of them take all 9000.
        idempotencyKey: key,
      },
      { ...named, settle: settleAtDoor },
    );

  const [first, second] = await Promise.all([till("pos-cash:till-A"), till("pos-cash:till-B")]);
  const outcomes = [first, second];
  const won = outcomes.filter((r) => r.ok);
  const lost = outcomes.filter((r) => !r.ok);
  assert.equal(won.length, 1, "exactly one till collects");
  assert.equal(lost.length, 1, "exactly one till is refused");

  const refused = lost[0];
  if (refused.ok) return;
  assert.equal(refused.reason, "amount");
  assert.equal(refused.outstandingCents, 0, "the refusal carries the real outstanding");

  const paidCents = store.booking_transactions
    .filter((t) => t.status === "paid")
    .reduce((sum, t) => sum + Number(t.gross_amount_cents ?? 0), 0);
  const reservedCents = store.order_collection_reservations
    .filter((r) => r.state === "reserved")
    .reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0);
  assert.equal(paidCents + reservedCents, 9000, "reserved plus paid never exceeds the total");
});

test("a card reservation is handed back when the payment adapter fails", async () => {
  const store = await openNineThousand();
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "online_card",
      contact,
      ...urls,
      amountCents: 4000,
      idempotencyKey: "pos-card:declined",
    },
    {
      ...named,
      createPaymentRequest: async () => ({
        ok: false as const,
        reason: "engine_error" as const,
        error: "Stripe said no.",
      }),
    },
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "engine_error");
  assert.equal(store.order_collection_reservations.length, 1);
  assert.equal(
    store.order_collection_reservations[0].state,
    "released",
    "a checkout that never opened must not hold the balance until the TTL",
  );

  // And the balance is collectable again, immediately, by the next till.
  const retry = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 9000,
      idempotencyKey: "pos-cash:after-decline",
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(retry.ok, true);
});

test("a stale expectedVersion is refused instead of collecting again", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const staleVersion = Number(store.orders[0].version);

  const first = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "pos-cash:v-first",
      expectedVersion: staleVersion,
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(first.ok, true);

  // The second device still holds the screen it loaded before that collection.
  const second = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u2",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "pos-cash:v-second",
      expectedVersion: staleVersion,
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.reason, "conflict");
  assert.equal(store.booking_transactions.filter((t) => t.status === "paid").length, 1);
});

test("a collection with no idempotency key is refused, never given a minted one", async () => {
  const store = await openNineThousand();
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "cash",
      contact,
      ...urls,
      amountCents: 3000,
      idempotencyKey: "  ",
    },
    { ...named, settle: settleAtDoor },
  );
  assert.equal(r.ok, false);
  assert.equal(store.booking_transactions.length, 0);
  assert.equal(store.order_collection_reservations.length, 0);
});

test("split settlement does not introduce a check entity", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8");
  assert.doesNotMatch(src, /from\("checks"\)/);
  const settle = readFileSync(join(process.cwd(), "src/lib/orders/settle-at-door.ts"), "utf8");
  assert.match(settle, /shift_id/);
});

test("collection.ts no longer sums transactions to work out what is owed", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8");
  // The unlocked read is what let two tills both see the whole balance. It is
  // deleted, not guarded, so the assertion is that it cannot come back by
  // accident: no read of gross amounts, no local reduce over transactions.
  // The name survives in the comment that explains the deletion; the CALL and
  // the definition must not.
  assert.doesNotMatch(src, /collectedPaidCents\s*\(/);
  assert.doesNotMatch(src, /function collectedPaidCents/);
  assert.doesNotMatch(src, /select\(\s*"gross_amount_cents/);
  assert.doesNotMatch(src, /\.eq\("status",\s*"paid"\)/);
  assert.doesNotMatch(src, /\.reduce\(/);
  // And that the replacement is actually wired.
  assert.match(src, /reserveCollection\(/);
  assert.match(src, /releaseCollectionReservation\(/);
  // The minted-key fallback is what turned a retry into a second collection.
  assert.doesNotMatch(src, /crypto\.randomUUID/);
});

test("the expire-orders cron reaps lapsed collection reservations", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/cron/expire-orders/route.ts"),
    "utf8",
  );
  assert.match(route, /reapCollectionReservations/);
});

/**
 * ── THE DOUBLE TAKE THE RELAXED INDEX MADE POSSIBLE ────────────────────────
 *
 * `idx_booking_transactions_booking_active` used to refuse a second live
 * transaction on one booking shell, and scoping it to `order_id IS NULL` (so a
 * split tab can settle across two tenders) removed that refusal from the
 * order-backed rail. What replaced it was a 900 second claim — under a Stripe
 * Checkout session that carried no expiry at all and lives about 24 hours. The
 * every-minute reaper released the claim while the session was still payable,
 * a second till took the whole balance, and the first session then settled on
 * top: 10000 cents on a 5000 cent order.
 *
 * The database refusal is back at the money write itself
 * (`guard_order_not_overcollected`), which is the part only the isolated-branch
 * proof can demonstrate. What is testable here is the other half: the claim
 * must outlive the session it guards, and the session must be told so.
 */

test("a card claim outlives Stripe's minimum session life, and the session is given the claim's own expiry", async () => {
  const store = await openNineThousand();
  const seen: Array<{ transactionId: string; expiresAt?: string | null }> = [];
  const r = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: store.orders[0].id as string,
      actorUserId: "u1",
      method: "online_card",
      contact,
      ...urls,
      amountCents: 9000,
      idempotencyKey: "pos-card:expiry",
    },
    {
      ...named,
      createPaymentRequest: async (req) => {
        seen.push({ transactionId: req.transactionId, expiresAt: req.expiresAt });
        return { ok: true as const, requestId: "cs_1", state: "pending" as const, checkoutUrl: "https://pay.test/1" };
      },
    },
  );
  assert.equal(r.ok, true);

  assert.equal(
    reservationTtlSeconds("online_card") >= STRIPE_CHECKOUT_MIN_TTL_SECONDS,
    true,
    "a card claim shorter than Stripe's 30 minute floor can always be reaped under a live session",
  );
  assert.equal(reservationTtlSeconds("cash"), RESERVATION_TTL_SECONDS);

  const claim = store.order_collection_reservations[0];
  assert.equal(seen.length, 1);
  assert.equal(
    seen[0].expiresAt,
    claim.expires_at,
    "the session must die with the claim, not on a lifetime computed here",
  );
  const secondsOfClaim = (Date.parse(String(claim.expires_at)) - Date.now()) / 1000;
  assert.equal(
    secondsOfClaim >= STRIPE_CHECKOUT_MIN_TTL_SECONDS,
    true,
    `the claim lasted ${Math.round(secondsOfClaim)}s, under Stripe's ${STRIPE_CHECKOUT_MIN_TTL_SECONDS}s session floor`,
  );
});

test("a replayed card key resumes the payment in flight instead of opening a second one", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  const seen: string[] = [];
  const deps = {
    ...named,
    createPaymentRequest: async (req: { transactionId: string }) => {
      seen.push(req.transactionId);
      // Stripe is idempotent at `cs_txn_<transactionId>`, so the same id gets
      // the same session back. A DIFFERENT id would be a second payable page.
      return {
        ok: true as const,
        requestId: `cs_${req.transactionId}`,
        state: "pending" as const,
        checkoutUrl: `https://pay.test/${req.transactionId}`,
      };
    },
  };
  const input = {
    tenantId: "t1",
    orderId,
    actorUserId: "u1" as const,
    method: "online_card" as const,
    contact,
    ...urls,
    amountCents: 9000,
    idempotencyKey: "pos-card:retry",
  };

  const first = await startCollection(fakeAdmin(store), input, deps);
  const second = await startCollection(fakeAdmin(store), input, deps);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(store.order_collection_reservations.length, 1, "one key, one claim");
  assert.equal(
    store.booking_transactions.length,
    1,
    "a retry that mints a second money row is a second payable checkout session",
  );
  assert.equal(
    store.order_collection_reservations[0].transaction_id,
    store.booking_transactions[0].id,
    "the claim carries its money row from the moment the row exists, not from settle time",
  );
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1], "both attempts ask Stripe for the SAME session");
  if (!first.ok || first.method !== "online_card") return;
  if (!second.ok || second.method !== "online_card") return;
  assert.equal(first.transactionId, second.transactionId);
});

test("a resumed card collection that cannot reach the provider keeps its claim", async () => {
  // The first attempt opened a session. If a retry's create call then fails
  // and we hand the balance back, a second till can collect money the buyer is
  // at that moment paying on the page the first attempt opened.
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  let attempt = 0;
  const deps = {
    ...named,
    createPaymentRequest: async (req: { transactionId: string }) => {
      attempt += 1;
      if (attempt === 1) {
        return {
          ok: true as const,
          requestId: `cs_${req.transactionId}`,
          state: "pending" as const,
          checkoutUrl: "https://pay.test/live",
        };
      }
      return { ok: false as const, reason: "engine_error" as const, error: "Stripe timed out." };
    },
  };
  const input = {
    tenantId: "t1",
    orderId,
    actorUserId: "u1" as const,
    method: "online_card" as const,
    contact,
    ...urls,
    amountCents: 9000,
    idempotencyKey: "pos-card:resume-fails",
  };

  const first = await startCollection(fakeAdmin(store), input, deps);
  assert.equal(first.ok, true);
  const retry = await startCollection(fakeAdmin(store), input, deps);
  assert.equal(retry.ok, false);
  assert.equal(
    store.order_collection_reservations[0].state,
    "reserved",
    "the claim must survive a failed retry, because the session it guards is still open",
  );
  assert.equal(store.booking_transactions.length, 1);
});

test("recordVerifiedCollection claims the balance, and a second verification is refused", async () => {
  const store = await openNineThousand();
  const orderId = store.orders[0].id as string;
  store.orders[0].customer_id = "cust-verified";
  const admin = fakeAdmin(store);

  const first = await recordVerifiedCollection(
    admin,
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      paidVia: "card",
      amountCents: 9000,
      currency: "USD",
    },
    { settle: settleAtDoor },
  );
  assert.equal(first.ok, true);
  assert.equal(store.order_collection_reservations.length, 1, "the quiet route claims like every other");
  assert.equal(store.order_collection_reservations[0].state, "settled");

  // A different rail, so a different operation key: this is a genuine second
  // allocation, not a replay, and there is nothing left to allocate.
  const second = await recordVerifiedCollection(
    admin,
    {
      tenantId: "t1",
      orderId,
      actorUserId: "u1",
      paidVia: "cash",
      amountCents: 9000,
      currency: "USD",
    },
    { settle: settleAtDoor },
  );
  assert.equal(second.ok, false);
  if (second.ok) return;
  // The first verification collected the whole 9000, so `completeOrder` closed
  // the sale: the claim is refused because the order is no longer open, which
  // is a truer answer than "try a smaller amount".
  assert.equal(second.reason, "not_open");
  assert.equal(
    store.booking_transactions.filter((t) => t.status === "paid").length,
    1,
    "the order was collected once",
  );

  // And a PARTIAL verification leaves the sale open, so the refusal there is
  // about the amount and carries the real balance.
  const part = await openNineThousand();
  const partOrderId = part.orders[0].id as string;
  part.orders[0].customer_id = "cust-verified";
  const partAdmin = fakeAdmin(part);
  const half = await recordVerifiedCollection(
    partAdmin,
    { tenantId: "t1", orderId: partOrderId, actorUserId: "u1", paidVia: "card", amountCents: 4000, currency: "USD" },
    { settle: settleAtDoor },
  );
  assert.equal(half.ok, true);
  const tooMuch = await recordVerifiedCollection(
    partAdmin,
    { tenantId: "t1", orderId: partOrderId, actorUserId: "u1", paidVia: "cash", amountCents: 6000, currency: "USD" },
    { settle: settleAtDoor },
  );
  assert.equal(tooMuch.ok, false);
  if (tooMuch.ok) return;
  assert.equal(tooMuch.reason, "amount");
  assert.equal(tooMuch.outstandingCents, 5000, "the refusal carries what is really left");

  const zero = await recordVerifiedCollection(
    partAdmin,
    { tenantId: "t1", orderId: partOrderId, actorUserId: "u1", paidVia: "cash", amountCents: 0, currency: "USD" },
    { settle: settleAtDoor },
  );
  assert.equal(zero.ok, false);
  if (zero.ok) return;
  assert.equal(zero.reason, "amount", "a zero collection is an amount problem, not an outage");
});

test("cancelling still reaches the till through collection.ts after the split", () => {
  // `finalizeOrCancel` moved to ./finalize when collection.ts passed its 800
  // line budget, and the budget was moved off rather than moved up. The name
  // is re-exported, so this asserts the surface POS imports did not quietly
  // narrow while the file was being trimmed. Its BEHAVIOUR is exercised in
  // commands.test.ts, which imports the name from "./collection" and cancels
  // real fixture orders through it: that suite passing is the runtime half of
  // this claim.
  const src = readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8");
  assert.match(src, /export \{ finalizeOrCancel, type FinalizeResult \} from "\.\/finalize"/);
  assert.equal(typeof finalizeOrCancel, "function");

  const moved = readFileSync(join(process.cwd(), "src/lib/pos/finalize.ts"), "utf8");
  assert.match(moved, /export async function finalizeOrCancel/);
  assert.doesNotMatch(src, /export async function finalizeOrCancel/);
});

test("the card path binds its claim to the money row before the session opens", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8");
  assert.match(src, /bindCollectionReservation\(/);
  // The transition that makes the row payable used to drop its error, leaving
  // the row at `draft` behind a working checkout URL.
  assert.match(src, /requestedErr/);
  // And the claim's expiry, not a locally computed one, is what the session gets.
  assert.match(src, /expiresAt: reservationExpiresAt/);
});
