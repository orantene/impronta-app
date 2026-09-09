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
  releaseCollectionReservation,
  reserveCollection,
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
  if (!customerId && (email || phone)) {
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
  const transactionId = (txnRow as { id: string }).id;

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
  });
  if (!request.ok) {
    // No checkout exists, so nothing will ever settle this claim. Hand it back
    // NOW rather than leaving the tab uncollectable until the TTL lapses.
    //
    // This is the LAST refusal that releases. Once a payment request exists the
    // buyer may be entering their card, and releasing would let a second till
    // collect the same money while that page is open.
    await giveBack();
    return { ok: false, reason: "engine_error", error: request.error };
  }

  await admin
    .from("booking_transactions")
    .update({ status: "payment_requested" })
    .eq("id", transactionId)
    .eq("status", "draft");

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
  | { ok: false; reason: "not_found" | "wrong_tenant" | "unavailable" | "no_contact"; error: string };

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
  if (!row.customer_id) {
    return { ok: false, reason: "no_contact", error: "Collecting money needs an email or a phone." };
  }
  const settle = deps.settle ?? settleAtDoor;
  const settled = await settle(admin as never, {
    tenantId: input.tenantId,
    orderId: row.id,
    actorUserId: input.actorUserId,
    paidVia: input.paidVia,
    amountCents: input.amountCents,
    currency: input.currency,
    idempotencyKey: `pos-verify:${row.id}:${input.paidVia}`,
  });
  if (!settled.ok) return { ok: false, reason: "unavailable", error: "Could not record the collection." };
  return {
    ok: true,
    orderId: settled.orderId,
    transactionId: settled.transactionId,
    alreadySettled: settled.alreadySettled,
  };
}

export type FinalizeResult =
  | { ok: true; orderId: string; status: "cancelled"; releasedAllocationIds: string[] }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_open" | "unavailable" | "conflict"; error: string };

export async function finalizeOrCancel(
  admin: Admin,
  input: { tenantId: string; orderId: string; expectedVersion?: number },
  deps: { release?: typeof releaseCapacity } = {},
): Promise<FinalizeResult> {
  if (typeof admin.rpc === "function") {
    const { data, error } = await admin.rpc("pos_cancel_draft", {
      p_tenant_id: input.tenantId,
      p_order_id: input.orderId,
      p_expected_version: input.expectedVersion ?? null,
    });
    if (error) {
      logServerError("pos.finalizeOrCancel.rpc", error);
      return { ok: false, reason: "unavailable", error: "Could not cancel the sale." };
    }
    const reply = (data ?? {}) as {
      ok?: boolean;
      reason?: string;
      order_id?: string;
      released_allocation_ids?: string[];
    };
    if (reply.ok !== true) {
      const reason =
        reply.reason === "not_found" ||
        reply.reason === "wrong_tenant" ||
        reply.reason === "not_open" ||
        reply.reason === "conflict"
          ? reply.reason
          : "unavailable";
      return { ok: false, reason, error: "Could not cancel the sale." };
    }
    return {
      ok: true,
      orderId: reply.order_id ?? input.orderId,
      status: "cancelled",
      releasedAllocationIds: reply.released_allocation_ids ?? [],
    };
  }

  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, version")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable", error: "Could not load the sale." };
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const row = order as { id: string; tenant_id: string; status: string; version: number };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  if (row.status !== "draft" && row.status !== "pending_payment") {
    return { ok: false, reason: "not_open", error: "This sale cannot be cancelled." };
  }
  if (input.expectedVersion != null && Number(row.version) !== input.expectedVersion) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }
  const { data: cancelled, error: uErr } = await admin
    .from("orders")
    .update({ status: "cancelled", version: Number(row.version) + 1 })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId)
    .in("status", ["draft", "pending_payment"])
    .eq("version", row.version)
    .select("id")
    .maybeSingle();
  if (uErr) {
    logServerError("pos.finalizeOrCancel", uErr);
    return { ok: false, reason: "unavailable", error: "Could not cancel the sale." };
  }
  if (!cancelled) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }

  const { data: lineRows, error: lineErr } = await admin
    .from("order_lines")
    .select("id")
    .eq("order_id", row.id)
    .eq("tenant_id", input.tenantId);
  if (lineErr) {
    logServerError("pos.finalizeOrCancel.lines", lineErr);
    return { ok: false, reason: "unavailable", error: "Could not release the held places." };
  }
  const lineIds = ((lineRows ?? []) as Array<{ id: string }>).map((l) => l.id);
  let releasedAllocationIds: string[] = [];
  if (lineIds.length > 0) {
    const { data: allocRows, error: allocErr } = await admin
      .from("capacity_allocations")
      .select("id, released_at")
      .eq("tenant_id", input.tenantId)
      .in("order_line_id", lineIds);
    if (allocErr) {
      logServerError("pos.finalizeOrCancel.allocations", allocErr);
      return { ok: false, reason: "unavailable", error: "Could not release the held places." };
    }
    const live = ((allocRows ?? []) as Array<{ id: string; released_at: string | null }>).filter(
      (a) => !a.released_at,
    );
    releasedAllocationIds = live.map((a) => a.id);
    if (releasedAllocationIds.length > 0) {
      const release = deps.release ?? releaseCapacity;
      const released = await release(releasedAllocationIds, admin as never);
      if (!released.ok) {
        return { ok: false, reason: "unavailable", error: "Could not release the held places." };
      }
    }
  }
  return { ok: true, orderId: row.id, status: "cancelled", releasedAllocationIds };
}

export { reportTerminalAvailability };
