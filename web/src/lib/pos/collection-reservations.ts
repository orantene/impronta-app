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

/** Where the card path leaves the reservation id for the webhook to find. */
export const RESERVATION_METADATA_KEY = "collection_reservation_id";

/** Long enough for a card redirect, short enough that a dead till frees the tab. */
export const RESERVATION_TTL_SECONDS = 900;

type RpcAdmin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type ReservationState = "reserved" | "settled" | "released";

export type ReservationMethod = "cash" | "online_card" | "terminal";

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

/** Read the reservation a card transaction recorded on itself, if any. */
export function reservationIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[RESERVATION_METADATA_KEY];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
