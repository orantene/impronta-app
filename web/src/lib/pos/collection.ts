import "server-only";

/**
 * POS collection and close commands (L53).
 *
 * Card collection uses the small Stripe adapter at the existing Checkout
 * boundary. Cash is recorded via `settleAtDoor`. Preparation tickets are
 * owned by `lib/preparation/tickets.ts`.
 */

import { logServerError } from "@/lib/server/safe-error";
import { settleAtDoor } from "@/lib/orders/settle-at-door";
import { bookingShellForOrder } from "@/lib/orders/booking-shell";
import { completeZeroTotalOrder, type OnOrderPaid } from "@/lib/orders/complete-order";
import { stripeCollectionAdapter } from "@/lib/payments/stripe-collection";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import type { EnsureCustomerResult } from "@/lib/customers/ensure-customer";
import { identityVerdict, type IdentityLine } from "@/lib/orders/identity-requirement";
import { releaseCapacity } from "@/lib/capacity";
import {
  submitOrderToPreparation,
  type PrepDestination,
  type SubmitPrepResult,
} from "@/lib/preparation/tickets";
import { currentShift } from "./shift";
import { holdDraftOrderCapacity } from "./hold-capacity";
import {
  RESERVATION_METADATA_KEY,
  bindCollectionReservation,
  releaseCollectionReservation,
  reserveCollection,
  reservationTtlSeconds,
  type ReserveCollectionResult,
} from "./collection-reservations";
import type { PosBuyerContact, PosCollectionMethod } from "./commands";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

const COLLECTABLE = new Set(["draft", "pending_payment"]);

/**
 * WHAT USED TO BE HERE, and why nothing replaces it.
 *
 * `collectedPaidCents` read every paid transaction on the order and subtracted
 * the sum from the total. Two tills ran that read at the same time, both saw
 * the whole balance free, and both collected it. There is no version of that
 * arithmetic that is safe outside the order's row lock, so it is gone rather
 * than fixed: `pos_reserve_collection` is now the only thing that computes what
 * is still owed, and it does so holding the lock.
 */

/**
 * Turn a reservation refusal into the refusal the till already understands.
 *
 * `exceeds_outstanding` becomes `amount` CARRYING THE REAL NUMBER, because the
 * till asked for more than is free and the useful answer is how much is free.
 * That number is now the database's, not a stale local subtraction, which is
 * the difference between "someone else is collecting this" and the old silent
 * double-collection.
 */
function refuseClaim(
  claim: Extract<ReserveCollectionResult, { ok: false }>,
): Extract<StartCollectionResult, { ok: false }> {
  const outstandingCents = claim.outstandingCents ?? undefined;
  switch (claim.reason) {
    case "not_found":
      return { ok: false, reason: "not_found", error: "That sale is gone." };
    case "wrong_tenant":
      return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
    case "not_open":
      return { ok: false, reason: "not_draft", error: "This sale is no longer open." };
    case "already_collected":
      return { ok: false, reason: "not_draft", error: "This sale is already collected.", outstandingCents: 0 };
    case "exceeds_outstanding":
      return {
        ok: false,
        reason: "amount",
        error: "This allocation is more than what is outstanding.",
        outstandingCents,
      };
    case "amount":
      return {
        ok: false,
        reason: "amount",
        error: "This allocation must be more than zero.",
        outstandingCents,
      };
    case "conflict":
      return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
    default:
      return { ok: false, reason: "unavailable", error: "Could not hold this collection." };
  }
}

/**
 * The order's lines, with the identity demand of the offering each one sells.
 *
 * Read here rather than derived from the draft in memory because the OFFERING
 * is the authority and it can have been edited since the line was added. The
 * decision itself is `lib/orders/identity-requirement`, which is pure and
 * shared with the public purchase pipeline so the counter and the web cannot
 * answer the same question two ways.
 */
async function identityLinesForOrder(
  admin: Admin,
  orderId: string,
): Promise<{ ok: true; lines: IdentityLine[] } | { ok: false }> {
  const { data: lineRows, error: lineErr } = await admin
    .from("order_lines")
    .select("offering_id, label, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (lineErr) {
    logServerError("pos.identityLinesForOrder.lines", lineErr);
    return { ok: false };
  }
  const rows = (lineRows ?? []) as Array<{
    offering_id: string | null;
    label: string | null;
    sort_order?: number | null;
  }>;
  const offeringIds = [...new Set(rows.map((r) => r.offering_id).filter((id): id is string => !!id))];
  if (offeringIds.length === 0) return { ok: true, lines: [] };

  const { data: offeringRows, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, title, requires_identity, identity_reason")
    .in("id", offeringIds);
  if (offErr) {
    logServerError("pos.identityLinesForOrder.offerings", offErr);
    return { ok: false };
  }
  const byId = new Map(
    ((offeringRows ?? []) as Array<{
      id: string;
      title: string | null;
      requires_identity: boolean | null;
      identity_reason: string | null;
    }>).map((o) => [o.id, o]),
  );

  return {
    ok: true,
    lines: rows.map((r) => {
      const offering = r.offering_id ? byId.get(r.offering_id) : undefined;
      return {
        offeringId: r.offering_id ?? null,
        offeringTitle: offering?.title ?? r.label ?? null,
        requiresIdentity: offering?.requires_identity === true,
        identityReason: offering?.identity_reason ?? null,
      };
    }),
  };
}

/**
 * May this order take money without a customer row?
 *
 * `unavailable` means the READ failed. It is not a verdict about the buyer and
 * must never be reported as one, and it must never lead to a second attempt at
 * the same write.
 */
async function anonymousSaleVerdict(
  admin: Admin,
  orderId: string,
): Promise<{ ok: true } | { ok: false; reason: "no_contact" | "unavailable"; error: string }> {
  const read = await identityLinesForOrder(admin, orderId);
  if (!read.ok) {
    return { ok: false, reason: "unavailable", error: "Could not check what this sale needs." };
  }
  // The counter is about to take money: `paid` is the status this answer
  // gates. A Void writes `cancelled` and never asks this question.
  const verdict = identityVerdict({ intoStatus: "paid", hasCustomer: false, lines: read.lines });
  if (verdict.ok) return { ok: true };
  return { ok: false, reason: "no_contact", error: verdict.message };
}

async function openShiftId(admin: Admin, tenantId: string): Promise<string | null> {
  const found = await currentShift(admin, { tenantId });
  if (!found.ok) return null;
  return found.shift?.id ?? null;
}

export type SubmitToPreparationResult = SubmitPrepResult;

export async function submitToPreparation(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    destination?: PrepDestination;
    station?: string;
    promisedAt?: string | null;
  },
): Promise<SubmitToPreparationResult> {
  return submitOrderToPreparation(admin, input);
}

/**
 * The order's one booking shell now lives in `lib/orders/booking-shell.ts`,
 * next to nothing in particular and imported by both paths that record money.
 *
 * It was private to this file, and that is exactly how the cash path came to
 * be broken: the card path below called it, the cash branch returned before
 * reaching it, and `settleAtDoor` then inserted a `booking_transactions` row
 * with a null `booking_id` that the scope trigger refused. Sharing it means
 * `settleAtDoor` ensures its own shell and no caller has to remember.
 */

export type StartCollectionResult =
  | {
      ok: true;
      method: "cash";
      orderId: string;
      transactionId: string;
      alreadySettled: boolean;
      amountCents: number;
      tenderedCents: number;
      changeCents: number;
      outstandingAfterCents: number;
    }
  | { ok: true; method: "online_card"; orderId: string; transactionId: string; checkoutUrl: string; mock?: boolean }
  | {
      ok: false;
      reason:
        | "no_contact"
        | "not_found"
        | "wrong_tenant"
        | "not_draft"
        | "amount"
        | "tendered"
        | "empty"
        | "unavailable"
        | "sold_out"
        | "terminal_unavailable"
        | "engine_error"
        | "conflict";
      error: string;
      /**
       * What is actually still owed, when the refusal is about the amount.
       * The till asked for more than is free, and the honest correction is the
       * real number rather than "try a smaller one".
       */
      outstandingCents?: number;
    };

export type StartCollectionDeps = {
  ensureCustomer?: (input: {
    tenantId: string;
    email?: string | null;
    phone?: string | null;
    displayName?: string | null;
  }) => Promise<EnsureCustomerResult>;
  createPaymentRequest?: ReturnType<typeof stripeCollectionAdapter>["createPaymentRequest"];
  settle?: typeof settleAtDoor;
  holdCapacity?: typeof holdDraftOrderCapacity;
  onOrderPaid?: OnOrderPaid;
};

export async function startCollection(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    actorUserId: string;
    method: PosCollectionMethod;
    contact?: PosBuyerContact;
    successUrl: string;
    cancelUrl: string;
    locale?: string | null;
    /** This allocation. Omit to claim whatever is still outstanding. */
    amountCents?: number;
    /** Cash counted from the customer. Defaults to amountCents. */
    tenderedCents?: number;
    /**
     * REQUIRED, and required is the whole fix. It used to be optional, and the
     * fallback minted a fresh uuid per call, so a retry of one allocation was a
     * SECOND allocation. A caller that cannot name its operation cannot be told
     * apart from a caller making a new one, so it is refused instead.
     */
    idempotencyKey: string;
    /** The order version the till was looking at. A stale one is a conflict. */
    expectedVersion?: number;
  },
  deps: StartCollectionDeps = {},
): Promise<StartCollectionResult> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, customer_id, currency, total_cents, promo_code_id, discount_cents")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("pos.startCollection", error);
    return { ok: false, reason: "unavailable", error: "Could not load the sale." };
  }
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const row = order as {
    id: string;
    tenant_id: string;
    status: string;
    customer_id: string | null;
    currency: string;
    total_cents: number;
    promo_code_id?: string | null;
    discount_cents?: number;
  };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  if (!COLLECTABLE.has(row.status)) {
    return { ok: false, reason: "not_draft", error: "This sale is no longer open." };
  }
  if (!Number.isInteger(row.total_cents) || row.total_cents < 0) {
    return { ok: false, reason: "unavailable", error: "The total is not collectable." };
  }

  const operationKey = (input.idempotencyKey ?? "").trim();
  if (operationKey.length < 8) {
    // Not a refusal an operator can act on, so it does not get operator words.
    // The log carries the real cause; the till is told the collection did not
    // start, which is true.
    logServerError(
      "pos.startCollection",
      `order ${row.id}: a collection needs an idempotency key of at least 8 characters. `
        + `Refusing rather than minting one, because a minted key turns a retry into a second collection.`,
    );
    return { ok: false, reason: "unavailable", error: "Could not start this collection." };
  }

  // What can be judged without claiming anything is judged first.
  if (
    input.amountCents !== undefined
    && (!Number.isInteger(input.amountCents) || input.amountCents <= 0)
  ) {
    return { ok: false, reason: "amount", error: "This allocation must be more than zero." };
  }
  if (
    input.tenderedCents !== undefined
    && (!Number.isInteger(input.tenderedCents) || input.tenderedCents < 0)
  ) {
    return { ok: false, reason: "tendered", error: "Tendered cash is less than this allocation." };
  }

  // `orders_identified_before_payment`: customer_id may be null ONLY while
  // status = draft, OR on a zero-total order that still carries a guest
  // session (R08 counter registrations). Money still needs a name, and the
  // refusal comes BEFORE the reservation so a nameless attempt claims nothing.
  const email = input.contact?.email ?? null;
  const phone = input.contact?.phone ?? null;
  if (row.total_cents > 0 && !row.customer_id && !email && !phone) {
    return { ok: false, reason: "no_contact", error: "Collecting money needs an email or a phone." };
  }

  let reservationId: string | null = null;
  let reservationExpiresAt: string | null = null;
  /**
   * The money row this operation key ALREADY has in flight, if any.
   *
   * A replayed card collection must resume that row rather than insert a
   * second one: two rows means two Checkout sessions against one claim, and
   * both of them are payable.
   */
  let inFlightTransactionId: string | null = null;
  let amountCents = 0;
  let tenderedCents = 0;
  let changeCents = 0;
  let outstandingAfterCents = 0;

  if (row.total_cents > 0) {
    const claimed = await reserveCollection(admin, {
      tenantId: input.tenantId,
      orderId: row.id,
      operationKey,
      amountCents: input.amountCents ?? null,
      method: input.method,
      actorUserId: input.actorUserId,
      expectedVersion: input.expectedVersion ?? null,
      // A CARD claim has to outlive the provider session it guards, and Stripe
      // will not let that session expire sooner than 30 minutes. A 900 second
      // claim under a session that lives for hours is how the same money got
      // taken twice: the reaper freed the balance, a second till took it, and
      // the first customer's page still worked.
      ttlSeconds: reservationTtlSeconds(input.method),
    });
    if (!claimed.ok) return refuseClaim(claimed);

    // A key whose claim was handed back is spent. Re-using it would collect
    // under an operation the till already abandoned.
    if (claimed.state === "released") {
      return { ok: false, reason: "conflict", error: "That collection was cancelled. Start a new one." };
    }

    // THE RETRY. The money row already exists and is paid, so the answer is
    // that transaction, not a second one.
    if (claimed.already && claimed.state === "settled") {
      const settledTendered = input.tenderedCents ?? claimed.amountCents;
      if (input.method === "online_card") {
        return {
          ok: true,
          method: "online_card",
          orderId: row.id,
          transactionId: claimed.transactionId ?? row.id,
          checkoutUrl: input.successUrl,
        };
      }
      return {
        ok: true,
        method: "cash",
        orderId: row.id,
        transactionId: claimed.transactionId ?? row.id,
        alreadySettled: true,
        amountCents: claimed.amountCents,
        tenderedCents: settledTendered,
        changeCents: Math.max(0, settledTendered - claimed.amountCents),
        outstandingAfterCents: claimed.outstandingCents,
      };
    }

    reservationId = claimed.reservationId;
    reservationExpiresAt = claimed.expiresAt;
    inFlightTransactionId = claimed.already ? claimed.transactionId : null;
    amountCents = claimed.amountCents;
    tenderedCents = input.tenderedCents ?? amountCents;
    if (tenderedCents < amountCents) {
      await releaseCollectionReservation(admin, claimed.reservationId);
      return { ok: false, reason: "tendered", error: "Tendered cash is less than this allocation." };
    }
    changeCents = tenderedCents - amountCents;
    // The RPC already subtracted this claim, and settling it swaps the claim
    // for a paid row of the same size. So this is the balance after the money
    // lands, in both the fresh and the resumed case.
    outstandingAfterCents = claimed.outstandingCents;
  }

  /**
   * Hand the claim back on any refusal between here and the money row.
   *
   * A reservation nobody completes is a balance nobody can collect until the
   * reaper runs. Waiting out the TTL because the buyer could not be named, or
   * because the seat went, would punish the next customer for our failure.
   */
  const giveBack = async (): Promise<void> => {
    if (reservationId) await releaseCollectionReservation(admin, reservationId);
  };

  let customerId = row.customer_id;
  // MONEY DOES NOT REQUIRE A NAME. A PRODUCT MAY.
  //
  // This used to refuse any paid sale without an email or a phone, which made
  // the commonest transaction on a counter impossible: an anonymous cash
  // walk-in. The retrieval anchor for that sale is `orders.receipt_code`,
  // printed on the slip and resolvable at `/r/<code>` by whoever holds it, and
  // `orders_identified_before_payment` now accepts exactly that shape (a guest
  // session plus a receipt code).
  //
  // What still refuses is a LINE whose offering says it needs a name: a ticket
  // the door checks, something to be delivered, credit spent later. That
  // decision is the offering's, not the till's.
  if (!customerId) {
    if (!email && !phone) {
      const allowed = await anonymousSaleVerdict(admin, row.id);
      if (!allowed.ok) {
        await giveBack();
        return { ok: false, reason: allowed.reason, error: allowed.error };
      }
    } else {
      if (!deps.ensureCustomer) {
        await giveBack();
        return { ok: false, reason: "unavailable", error: "Could not name the buyer." };
      }
      const named = await deps.ensureCustomer({
        tenantId: input.tenantId,
        email,
        phone,
        displayName: input.contact?.displayName,
      });
      if (!named.ok) {
        await giveBack();
        return { ok: false, reason: "no_contact", error: named.error };
      }
      customerId = named.customerId;
      const { error: attErr } = await admin
        .from("orders")
        .update({ customer_id: customerId })
        .eq("id", row.id)
        .in("status", ["draft", "pending_payment"]);
      if (attErr) {
        logServerError("pos.startCollection.attach", attErr);
        await giveBack();
        return { ok: false, reason: "unavailable", error: "Could not name the buyer." };
      }
    }
  }

  const hold = deps.holdCapacity ?? holdDraftOrderCapacity;
  const held = await hold(admin, {
    tenantId: input.tenantId,
    orderId: row.id,
    actorUserId: input.actorUserId,
  });
  if (!held.ok) {
    const reason =
      held.reason === "sold_out" ||
      held.reason === "wrong_tenant" ||
      held.reason === "not_found" ||
      held.reason === "not_draft"
        ? held.reason
        : "unavailable";
    await giveBack();
    return { ok: false, reason, error: held.error };
  }

  if (row.promo_code_id && customerId && typeof admin.rpc === "function") {
    const redeemed = await admin.rpc("redeem_tenant_promo", {
      p_code_id: row.promo_code_id,
      p_order_id: row.id,
      p_customer_id: customerId,
      p_amount_cents: Math.trunc(Number(row.discount_cents ?? 0)),
    });
    if (redeemed.error) {
      logServerError("pos.startCollection.redeem", redeemed.error);
      await giveBack();
      return { ok: false, reason: "unavailable", error: "Could not redeem that code." };
    }
    const verdict = (redeemed.data ?? {}) as { ok?: boolean; reason?: string };
    if (verdict.ok !== true && verdict.reason !== "already") {
      await giveBack();
      return { ok: false, reason: "unavailable", error: "That code cannot be used on this sale." };
    }
  }

  if (row.total_cents === 0) {
    const done = await completeZeroTotalOrder(
      admin as never,
      { tenantId: input.tenantId, orderId: row.id },
      { onOrderPaid: deps.onOrderPaid },
    );
    if (!done.ok) {
      return { ok: false, reason: "unavailable", error: done.error ?? "Could not close a free sale." };
    }
    return {
      ok: true,
      method: "cash",
      orderId: row.id,
      transactionId: row.id,
      alreadySettled: false,
      amountCents: 0,
      tenderedCents: 0,
      changeCents: 0,
      outstandingAfterCents: 0,
    };
  }

  if (input.method === "cash") {
    const settle = deps.settle ?? settleAtDoor;
    const shiftId = await openShiftId(admin, input.tenantId);
    const settled = await settle(admin as never, {
      tenantId: input.tenantId,
      orderId: row.id,
      actorUserId: input.actorUserId,
      paidVia: "cash",
      amountCents,
      currency: row.currency,
      idempotencyKey: operationKey,
      shiftId,
      tenderedCents,
      // The claim travels with the money so `settleAtDoor` can close it at the
      // one moment that is true: after the transaction actually reaches `paid`.
      reservationId,
      // So a cash sale that is the first collection on this order stamps the
      // buyer onto the shell, exactly as the card path does.
      contact: input.contact,
    }, { onOrderPaid: deps.onOrderPaid });
    if (!settled.ok) {
      // DELIBERATELY NOT RELEASED. `settleAtDoor` may have inserted the money
      // row and died part-way to `paid`; it is written to be resumable, and the
      // retry with this same key finds that row and finishes the walk. Handing
      // the claim back here would free a balance a half-written transaction is
      // about to take, and the same-key retry would then be refused as an
      // abandoned operation. If nobody retries, the TTL reaper frees it.
      return { ok: false, reason: "unavailable", error: "Could not record the cash." };
    }
    return {
      ok: true,
      method: "cash",
      orderId: settled.orderId,
      transactionId: settled.transactionId,
      alreadySettled: settled.alreadySettled,
      amountCents,
      tenderedCents,
      changeCents,
      outstandingAfterCents,
    };
  }

  const shell = await bookingShellForOrder(admin, {
    tenantId: input.tenantId,
    orderId: row.id,
    currency: row.currency,
    revenue: amountCents / 100,
    contact: input.contact,
  });
  if (!shell.ok) {
    await giveBack();
    return { ok: false, reason: "engine_error", error: "Could not open the payment." };
  }
  const bookingId = shell.bookingId;

  /**
   * RESUME, DO NOT MINT A SECOND. When this operation key already has a money
   * row bound to its live claim, that row is the payment in flight, and
   * `createCheckoutSessionForTransaction` is idempotent at
   * `cs_txn_<transactionId>` — so re-running the create below with the SAME id
   * returns the SAME session rather than a second payable one.
   *
   * Without this the retry inserted a fresh transaction against one claim and
   * opened a second session, and both could be paid: a double take with no
   * reaper involved at all.
   */
  let transactionId: string;
  if (inFlightTransactionId) {
    transactionId = inFlightTransactionId;
  } else {
    const { data: txnRow, error: txnErr } = await admin
      .from("booking_transactions")
      .insert({
        booking_id: bookingId,
        order_id: row.id,
        source_tenant_id: input.tenantId,
        payer_user_id: input.actorUserId,
        payer_email: input.contact?.email ?? null,
        gross_amount_cents: amountCents,
        platform_fee_basis_points: 0,
        platform_fee_cents: 0,
        net_amount_cents: amountCents,
        currency: row.currency,
        provider: "stripe",
        status: "draft",
        checkout_type: "full",
        requested_at: new Date().toISOString(),
        // The webhook that marks this paid is the only thing that knows the
        // payment landed, and it has the transaction, not the reservation. So the
        // claim's id rides on the money row it belongs to.
        metadata: reservationId ? { [RESERVATION_METADATA_KEY]: reservationId } : {},
      })
      .select("id")
      .single();
    if (txnErr || !txnRow) {
      logServerError("pos.startCollection.txn", txnErr);
      await giveBack();
      return { ok: false, reason: "engine_error", error: "Could not open the payment." };
    }
    transactionId = (txnRow as { id: string }).id;

    // The claim learns its money row NOW, not at settle time. That is what
    // makes the paragraph above possible: a replay is answered with this id.
    if (reservationId) {
      const bound = await bindCollectionReservation(admin, { reservationId, transactionId });
      if (!bound.ok) {
        // The claim could not be tied to this row, so a retry would not find
        // it and would open a second payment. Refuse before a session exists,
        // and hand the balance back: nothing is payable yet.
        logServerError(
          "pos.startCollection.bind",
          `order ${row.id}: reservation ${reservationId} would not bind to transaction ${transactionId} (${bound.reason})`,
        );
        await giveBack();
        return { ok: false, reason: "engine_error", error: "Could not open the payment." };
      }
    }
  }

  const create =
    deps.createPaymentRequest ?? stripeCollectionAdapter().createPaymentRequest;
  const request = await create({
    transactionId,
    amountCents,
    currency: row.currency,
    payerEmail: input.contact?.email ?? null,
    inquiryId: null,
    bookingId,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    description: "POS sale",
    locale: input.locale,
    method: "online_card",
    // THE SESSION DIES WITH THE CLAIM. The claim's own instant, straight from
    // the database, not `now + a TTL` computed here: on a replay the claim is
    // already part-spent, and a session told it had a fresh half hour would
    // outlive the balance it holds all over again.
    expiresAt: reservationExpiresAt,
  });
  if (!request.ok) {
    // No checkout exists, so nothing will ever settle this claim. Hand it back
    // NOW rather than leaving the tab uncollectable until the TTL lapses.
    //
    // This is the LAST refusal that releases, and ONLY on the attempt that was
    // opening the session. A RESUME already has one: the buyer may be on that
    // page right now, and releasing the balance because this retry could not
    // reach the provider is exactly the double take being closed here. So a
    // resume refuses and keeps the claim.
    if (!inFlightTransactionId) await giveBack();
    return { ok: false, reason: "engine_error", error: request.error };
  }

  // CHECKED, and it used to be ignored. `validate_booking_transaction_status_transition`
  // refuses to move a non-manual row past `draft` without a payout receiver,
  // and a dropped error left the row at `draft` while this function returned a
  // working checkout URL: the buyer pays, and the webhook then cannot mark
  // paid a transaction that never reached `payment_requested`.
  //
  // The claim is NOT handed back. A session exists and the buyer may be on it,
  // so freeing the balance here is precisely the double-take this change
  // closes; the TTL, and the retry on the same key, are the way out.
  const { error: requestedErr } = await admin
    .from("booking_transactions")
    .update({ status: "payment_requested" })
    .eq("id", transactionId)
    .eq("status", "draft");
  if (requestedErr) {
    logServerError("pos.startCollection.requested", requestedErr);
    return { ok: false, reason: "engine_error", error: "Could not open the payment." };
  }

  const { error: statusErr } = await admin
    .from("orders")
    .update({ status: "pending_payment" })
    .eq("id", row.id)
    .in("status", ["draft", "pending_payment"]);
  if (statusErr) {
    logServerError("pos.startCollection.status", statusErr);
    return { ok: false, reason: "unavailable", error: "Could not hold the sale for payment." };
  }

  return {
    ok: true,
    method: "online_card",
    orderId: row.id,
    transactionId,
    checkoutUrl: request.checkoutUrl ?? input.successUrl,
    mock: request.mock,
  };
}

export type RecordVerifiedCollectionResult =
  | { ok: true; orderId: string; transactionId: string; alreadySettled: boolean }
  | {
      ok: false;
      reason:
        | "not_found"
        | "wrong_tenant"
        | "unavailable"
        | "no_contact"
        | "amount"
        | "not_open";
      error: string;
      /** What is actually still owed, when the refusal is about the amount. */
      outstandingCents?: number;
    };

/**
 * Record a collection a human already verified landed (a terminal receipt, a
 * transfer that cleared).
 *
 * IT RESERVES LIKE EVERYTHING ELSE, and it did not used to. This function took
 * `amountCents` from its caller and handed it straight to `settleAtDoor`: no
 * lock, no outstanding check, no claim. Two calls, or one call racing a POS
 * collection on the same tab, both recorded the full amount. That is the same
 * double take by a quieter door, so it goes through the same one.
 *
 * The operation key is derived from the order and the rail rather than minted,
 * so a retry of one verification replays it instead of allocating a second.
 */
export async function recordVerifiedCollection(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    actorUserId: string;
    paidVia: "cash" | "card";
    amountCents: number;
    currency: string;
  },
  deps: { settle?: typeof settleAtDoor } = {},
): Promise<RecordVerifiedCollectionResult> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, customer_id")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable", error: "Could not load the sale." };
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const row = order as { id: string; tenant_id: string; status: string; customer_id: string | null };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  // Same rule as `startCollection`: the sale needs a name only when something
  // in it does. A verified cash collection on an anonymous walk-in is legal.
  if (!row.customer_id) {
    const allowed = await anonymousSaleVerdict(admin, row.id);
    if (!allowed.ok) return { ok: false, reason: allowed.reason, error: allowed.error };
  }

  const operationKey = `pos-verify:${row.id}:${input.paidVia}`;
  const claimed = await reserveCollection(admin, {
    tenantId: input.tenantId,
    orderId: row.id,
    operationKey,
    amountCents: input.amountCents,
    // `paidVia` is the rail the money came in on; the claim only cares whether
    // this is a counter tender or a provider session, and a verified receipt
    // is already in hand either way.
    method: "cash",
    actorUserId: input.actorUserId,
  });
  if (!claimed.ok) {
    if (claimed.reason === "not_found") return { ok: false, reason: "not_found", error: "That sale is gone." };
    if (claimed.reason === "wrong_tenant") {
      return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
    }
    if (claimed.reason === "not_open") {
      // The sale closed under this verification. Distinct from `amount`: there
      // is nothing to correct and no smaller number that would work.
      return { ok: false, reason: "not_open", error: "This sale is no longer open." };
    }
    if (claimed.reason === "amount") {
      return { ok: false, reason: "amount", error: "This collection must be more than zero." };
    }
    if (claimed.reason === "exceeds_outstanding" || claimed.reason === "already_collected") {
      return {
        ok: false,
        reason: "amount",
        error: "This collection is more than what is outstanding.",
        outstandingCents: claimed.outstandingCents ?? 0,
      };
    }
    return { ok: false, reason: "unavailable", error: "Could not record the collection." };
  }
  if (claimed.state === "released") {
    return { ok: false, reason: "unavailable", error: "Could not record the collection." };
  }

  const settle = deps.settle ?? settleAtDoor;
  const settled = await settle(admin as never, {
    tenantId: input.tenantId,
    orderId: row.id,
    actorUserId: input.actorUserId,
    paidVia: input.paidVia,
    amountCents: claimed.amountCents,
    currency: input.currency,
    idempotencyKey: operationKey,
    // Closed by `settleAtDoor` at the one moment that is true: once the money
    // row actually reaches `paid`.
    reservationId: claimed.reservationId,
  });
  if (!settled.ok) {
    // NOT released, for the same reason the cash path does not: `settleAtDoor`
    // is resumable and may have a half-written money row this key will finish.
    return { ok: false, reason: "unavailable", error: "Could not record the collection." };
  }
  return {
    ok: true,
    orderId: settled.orderId,
    transactionId: settled.transactionId,
    alreadySettled: settled.alreadySettled,
  };
}

/**
 * Re-exported, not moved away. `finalizeOrCancel` lives in `./finalize` now
 * (see that file for why), and POS imports one module for the till's two
 * outcomes: money taken, or the sale closed with the places handed back.
 */
export { finalizeOrCancel, type FinalizeResult } from "./finalize";

export { reportTerminalAvailability };
