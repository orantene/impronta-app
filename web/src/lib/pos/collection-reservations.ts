import "server-only";

/**
 * Reservations over an order's outstanding balance (T1-03).
 *
 * WHAT THIS REPLACES. `startCollection` used to work out what was still owed by
 * reading `booking_transactions` and subtracting. Nothing locked the order, so
 * two tills reading the same tab both saw the whole balance, both passed the
 * "not more than outstanding" check, and both took it. Outstanding is not a
 * number a caller can compute correctly; it is a fact about the order that only
 * the row lock can produce. `pos_reserve_collection` holds that lock, and this
 * module is the only way TypeScript talks to it.
 *
 * WHY A CLAIM AND NOT JUST A LOCK. The money row cannot be written inside the
 * same transaction as the check: the card path has to go out to Stripe first,
 * and the cash path walks a transaction through three states. So the balance is
 * CLAIMED before it is taken, and the claim expires. A till that dies mid-sale
 * costs the tab a few minutes of that amount, not a permanently wedged balance.
 *
 * `unavailable` IS THE TRANSPORT, and it never becomes a second attempt. When
 * the RPC call itself fails we do not know whether the reservation exists, and
 * the only thing that can find out is a replay of the SAME operation key.
 * Nothing in here retries.
 */

import { logServerError } from "@/lib/server/safe-error";

export type ReservationState = "reserved" | "settled" | "released";

export type ReservationMethod = "cash" | "online_card" | "terminal" | "link";

/** Where the card path leaves the reservation id for the webhook to find. */
export const RESERVATION_METADATA_KEY = "collection_reservation_id";

/**
 * Where the card path leaves the PROVIDER's own request id, beside the claim.
 *
 * THE WHOLE RECOVERY DEPENDS ON THIS ONE STRING. A card collection opened a
 * Checkout session, got its id back, and threw it away: the transaction knew
 * it had asked for money and nothing knew WHAT it had asked. When the response
 * was then lost, no code in the system could find out whether the money moved,
 * so the only remaining move was to tell a person to go and look at the
 * terminal.
 *
 * It sits in the same bag as the reservation deliberately. The two facts are
 * one fact — this claim on this balance was handed to that request — and a
 * recovery that had one without the other could either ask the provider and
 * not know what to release, or release and not know what it had asked.
 */
export const PAYMENT_REQUEST_METADATA_KEY = "collection_payment_request_id";

/**
 * How long a CASH claim lives. Short on purpose: the cash path completes
 * inside the request that took it, so this only covers a till that died
 * mid-sale, and every second of it is a second the next customer waits.
 */
export const RESERVATION_TTL_SECONDS = 900;

/**
 * Stripe Checkout refuses an `expires_at` closer than 30 minutes.
 *
 * Not a number we chose, which is exactly why it is named. The card claim has
 * to outlive the session it guards, and the session cannot be made shorter
 * than this, so the claim cannot be made shorter either.
 */
export const STRIPE_CHECKOUT_MIN_TTL_SECONDS = 1800;

/**
 * How long a CARD claim lives, and why it is not 900 seconds.
 *
 * THE DEFECT THIS CLOSES. A card collection reserved for 900 seconds and then
 * sent the buyer to a hosted Checkout session that carried NO expiry and lived
 * about 24 hours. The every-minute reaper released the claim while the session
 * was still payable, a second till reserved the whole balance and took it, and
 * the first customer's session then settled on top: two payments, one order.
 *
 * The claim is now the longer of the two lifetimes and the session is stamped
 * with the claim's own `expires_at`, so the reaper cannot free a balance a
 * live session can still take. The three minutes over Stripe's floor are the
 * gap between claiming the balance and creating the session: the session's
 * expiry is derived from the CLAIM's instant, not from "now", so that gap eats
 * into the margin rather than into the guarantee.
 */
export const CARD_RESERVATION_TTL_SECONDS = STRIPE_CHECKOUT_MIN_TTL_SECONDS + 180;

/** The claim lifetime a tender of this kind needs. */
export function reservationTtlSeconds(method: ReservationMethod): number {
  return method === "cash" ? RESERVATION_TTL_SECONDS : CARD_RESERVATION_TTL_SECONDS;
}

type RpcAdmin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type ReserveCollectionRefusal =
  | "not_found"
  | "wrong_tenant"
  | "not_open"
  | "conflict"
  | "already_collected"
  | "exceeds_outstanding"
  | "amount"
  | "unavailable";

export type ReserveCollectionResult =
  | {
      ok: true;
      reservationId: string;
      /** True when this key had already claimed its share. Not a new claim. */
      already: boolean;
      state: ReservationState;
      /** Set once the reservation settled onto a real money row. */
      transactionId: string | null;
      amountCents: number;
      /** What is left AFTER this reservation. */
      outstandingCents: number;
      /**
       * When the claim lapses, as the DATABASE recorded it.
       *
       * Threaded out so the card path can hand the provider session the very
       * same instant. Deriving it locally from "now plus the TTL we asked for"
       * would drift by the round trip and, on a replay, by however long the
       * first attempt has already been running.
       */
      expiresAt: string | null;
    }
  | { ok: false; reason: ReserveCollectionRefusal; outstandingCents: number | null };

const REFUSALS = new Set<string>([
  "not_found",
  "wrong_tenant",
  "not_open",
  "conflict",
  "already_collected",
  "exceeds_outstanding",
  "amount",
]);

const STATES = new Set<string>(["reserved", "settled", "released"]);

function toInt(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function reserveCollection(
  admin: RpcAdmin,
  input: {
    tenantId: string;
    orderId: string;
    /** Unique per allocation. The same key twice is one claim, never two. */
    operationKey: string;
    /** Omit to claim whatever is left, resolved under the lock. */
    amountCents?: number | null;
    method: ReservationMethod;
    actorUserId?: string | null;
    expectedVersion?: number | null;
    ttlSeconds?: number;
  },
): Promise<ReserveCollectionResult> {
  if (typeof admin.rpc !== "function") {
    logServerError(
      "pos.reserveCollection",
      "the collection client cannot call pos_reserve_collection; refusing rather than collecting unguarded",
    );
    return { ok: false, reason: "unavailable", outstandingCents: null };
  }

  const { data, error } = await admin.rpc("pos_reserve_collection", {
    p_tenant_id: input.tenantId,
    p_order_id: input.orderId,
    p_operation_key: input.operationKey,
    p_amount_cents: input.amountCents ?? null,
    p_method: input.method,
    p_actor_id: input.actorUserId ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_ttl_seconds: input.ttlSeconds ?? RESERVATION_TTL_SECONDS,
  });
  if (error) {
    logServerError("pos.reserveCollection", error);
    return { ok: false, reason: "unavailable", outstandingCents: null };
  }

  const reply = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    already?: boolean;
    reservation_id?: string;
    state?: string;
    transaction_id?: string | null;
    amount_cents?: number | string;
    outstanding_cents?: number | string | null;
    expires_at?: string | null;
  };

  if (reply.ok !== true) {
    const reason = REFUSALS.has(reply.reason ?? "")
      ? (reply.reason as ReserveCollectionRefusal)
      : "unavailable";
    return { ok: false, reason, outstandingCents: toInt(reply.outstanding_cents) };
  }

  const reservationId = reply.reservation_id;
  const amountCents = toInt(reply.amount_cents);
  const outstandingCents = toInt(reply.outstanding_cents);
  if (!reservationId || amountCents == null || outstandingCents == null) {
    // A success shape missing its own answer is not a success.
    logServerError("pos.reserveCollection", "pos_reserve_collection returned ok without a reservation");
    return { ok: false, reason: "unavailable", outstandingCents: null };
  }

  return {
    ok: true,
    reservationId,
    already: reply.already === true,
    state: STATES.has(reply.state ?? "") ? (reply.state as ReservationState) : "reserved",
    transactionId: reply.transaction_id ?? null,
    amountCents,
    outstandingCents,
    expiresAt: typeof reply.expires_at === "string" ? reply.expires_at : null,
  };
}

export type SettleReservationResult =
  | { ok: true; already: boolean; state: ReservationState }
  | { ok: false; reason: "not_found" | "not_reserved" | "unavailable" };

async function moveReservation(
  admin: RpcAdmin,
  reservationId: string,
  transactionId: string | null,
  state: Extract<ReservationState, "settled" | "released">,
): Promise<SettleReservationResult> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_settle_collection_reservation", {
    p_reservation_id: reservationId,
    p_transaction_id: transactionId,
    p_state: state,
  });
  if (error) {
    logServerError(`pos.reservation.${state}`, error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; already?: boolean; state?: string };
  if (reply.ok !== true) {
    const reason =
      reply.reason === "not_found" || reply.reason === "not_reserved" ? reply.reason : "unavailable";
    return { ok: false, reason };
  }
  return {
    ok: true,
    already: reply.already === true,
    state: STATES.has(reply.state ?? "") ? (reply.state as ReservationState) : state,
  };
}

/**
 * The money row exists and is paid. Bind the claim to it.
 *
 * Called AFTER the transaction reaches `paid`, never before: a reservation
 * settled against a transaction still walking to paid would say the cash was
 * received while its own money row says it was not.
 */
export async function settleCollectionReservation(
  admin: RpcAdmin,
  input: { reservationId: string; transactionId: string | null },
): Promise<SettleReservationResult> {
  return moveReservation(admin, input.reservationId, input.transactionId, "settled");
}

/**
 * Give the claim back.
 *
 * A refusal AFTER the reservation exists (the card adapter declined, the buyer
 * could not be named, the seat went) must hand the balance back immediately.
 * Waiting for the reaper would leave the tab uncollectable for the whole TTL
 * with nothing wrong with it.
 */
export async function releaseCollectionReservation(
  admin: RpcAdmin,
  reservationId: string,
): Promise<SettleReservationResult> {
  return moveReservation(admin, reservationId, null, "released");
}

export type BindReservationResult =
  | { ok: true; transactionId: string }
  | { ok: false; reason: "not_found" | "not_reserved" | "bound_elsewhere" | "unavailable" };

/**
 * Name the money row a live claim is waiting on.
 *
 * THE SECOND ROUTE TO A DOUBLE TAKE, and it needed no reaper at all. A card
 * collection reserves, inserts its transaction, then opens a Checkout session.
 * A retry of the same operation key came back `already` with `transaction_id`
 * still null, because the claim only learned its transaction when it SETTLED.
 * The caller could not tell "this key already has a payment in flight" from
 * "this key has a claim and nothing else yet", so it minted a second
 * transaction and a second session against one claim, and both were payable.
 *
 * Binding while the claim is still `reserved` is what lets a replay resume the
 * payment already in flight instead of opening another one.
 */
export async function bindCollectionReservation(
  admin: RpcAdmin,
  input: { reservationId: string; transactionId: string },
): Promise<BindReservationResult> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_bind_collection_reservation", {
    p_reservation_id: input.reservationId,
    p_transaction_id: input.transactionId,
  });
  if (error) {
    logServerError("pos.reservation.bind", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; transaction_id?: string | null };
  if (reply.ok !== true) {
    const reason =
      reply.reason === "not_found"
      || reply.reason === "not_reserved"
      || reply.reason === "bound_elsewhere"
        ? reply.reason
        : "unavailable";
    return { ok: false, reason };
  }
  return { ok: true, transactionId: reply.transaction_id ?? input.transactionId };
}

export type ReapReservationsResult = { ok: true; released: number } | { ok: false };

/** Expired claims are money nobody can collect. The cron gives it back. */
export async function reapCollectionReservations(
  admin: RpcAdmin,
  limit = 200,
): Promise<ReapReservationsResult> {
  if (typeof admin.rpc !== "function") return { ok: false };
  const { data, error } = await admin.rpc("reap_collection_reservations", { p_limit: limit });
  if (error) {
    logServerError("pos.reapCollectionReservations", error);
    return { ok: false };
  }
  const reply = (data ?? {}) as { ok?: boolean; released?: number | string };
  if (reply.ok !== true) return { ok: false };
  return { ok: true, released: toInt(reply.released) ?? 0 };
}

/**
 * The bag a card collection writes on its money row, built in ONE place.
 *
 * Both keys are read by different code at different times — the webhook and
 * `markPaid` want the claim, the recovery worker wants the request — and the
 * shape they agree on has no other writer. Building it here rather than inline
 * at the call site is what stops a future edit adding one key and dropping the
 * other, which would leave a recovery able to ask the provider and unable to
 * say what to release, or the reverse.
 */
export function collectionMetadata(input: {
  reservationId: string | null;
  paymentRequestId: string;
}): Record<string, string> {
  return {
    ...(input.reservationId ? { [RESERVATION_METADATA_KEY]: input.reservationId } : {}),
    [PAYMENT_REQUEST_METADATA_KEY]: input.paymentRequestId,
  };
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Read the reservation a card transaction recorded on itself, if any. */
export function reservationIdFromMetadata(metadata: unknown): string | null {
  return metadataString(metadata, RESERVATION_METADATA_KEY);
}

/**
 * Read the provider request a card transaction recorded on itself, if any.
 *
 * Absent means this transaction cannot be reconciled with the provider at all
 * — it predates the stamp, or it was opened in mock mode — and every caller
 * has to say so rather than guessing. That absence is why the exceptions inbox
 * still has a no-button branch.
 */
export function paymentRequestIdFromMetadata(metadata: unknown): string | null {
  return metadataString(metadata, PAYMENT_REQUEST_METADATA_KEY);
}
