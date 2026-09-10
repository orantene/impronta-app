import "server-only";

/**
 * recover-collections.ts — finish a card collection whose response was lost.
 *
 * THE HOLE THIS FILLS. `startCollection` opens a payment at the provider and
 * returns. Everything after that is the webhook's job, and a webhook that never
 * arrives leaves a transaction sitting in `payment_requested` for ever: the
 * customer may have been charged, the order is still unsettled, and part of the
 * order's balance is claimed by a reservation nobody will ever settle. Until
 * now the system's entire answer to that was a row in the exceptions inbox
 * advising a person to go and look at the terminal, because the adapter's state
 * lookup was a stub that returned `unknown` without asking anybody.
 *
 * THE PROVIDER IS THE AUTHORITY. Not the till, not this file. So the worker
 * asks, and then does exactly what the answer licenses:
 *
 *   succeeded  complete the order the way the webhook would — one call to
 *              `markPaid`, which is the same seam the webhook uses, so the
 *              payout fan-out, the order settlement and the closing of the
 *              collection reservation all happen once, by the code that already
 *              knows how.
 *   failed     the money did not move. Mark the transaction failed and hand the
 *   cancelled  reserved balance back, so the till can take the sale again
 *              immediately instead of waiting out the claim's TTL.
 *   pending    the buyer is still on the page. Leave everything alone.
 *   unknown    we asked and could not be told. Leave everything alone, count
 *              the attempt, come back later.
 *
 * IT CANNOT START A PAYMENT. There is no create in this module's imports, and
 * that is deliberate rather than incidental: a recovery worker with a create in
 * scope is one editing mistake away from being the thing that charges a
 * customer a second time. The adapter is narrowed to its lookup at the seam
 * below (`RecoveryProbe`) so nothing here can even name the other verb.
 *
 * WHY IT IS NOT A HANDLER ON THE OUTBOX. The outbox delivers effects that a
 * transaction already decided to have; nothing decided to have this one. There
 * is no moment at which a message could have been written, because the failure
 * being recovered from is precisely a process that stopped before it could
 * write anything. So the queue is the set of stale transactions itself, and the
 * claim is `pos_claim_stale_collections` — same `FOR UPDATE SKIP LOCKED` shape
 * as `claim_outbox_messages`, for the same reason.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { PaymentRequestSnapshot, PaymentRequestState } from "@/lib/payments/collection";
import { stripeCollectionAdapter } from "@/lib/payments/stripe-collection";
import { markFailed, markPaid } from "@/lib/bookings/transactions";
import { releaseCollectionReservation } from "./collection-reservations";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

/**
 * The ONLY thing this worker may do to a provider: ask.
 *
 * A `CollectionAdapter` would have worked and would have carried
 * `createPaymentRequest` into this file with it. Narrowing the seam to one
 * method is the difference between "we do not call create" and "create is not
 * reachable from here".
 */
export type RecoveryProbe = (
  requestId: string,
) => Promise<PaymentRequestSnapshot | { ok: false; error: string }>;

export type RecoverCollectionsDeps = {
  probe?: RecoveryProbe;
  markPaid?: typeof markPaid;
  markFailed?: typeof markFailed;
  release?: typeof releaseCollectionReservation;
};

/**
 * How long a card collection may sit unresolved before the worker asks.
 *
 * Kept in step with `COLLECTION_STALE_MS` in `lib/exceptions/model.ts`: the
 * inbox calls a collection an exception at twenty minutes, and a worker that
 * started asking earlier would be reconciling payments the inbox still
 * considers healthy, while one that started later would leave a row on an
 * operator's screen that the machine was already able to resolve.
 */
export const RECOVERY_STALE_SECONDS = 20 * 60;

/**
 * How long a claim is held before another pass may take the same row.
 *
 * Longer than any single provider round trip and shorter than the gap between
 * two cron runs of the batch size below, so a worker that dies mid-lookup
 * costs one interval rather than parking the row until somebody notices.
 */
export const RECOVERY_VISIBILITY_SECONDS = 5 * 60;

/**
 * How many collections one pass reconciles.
 *
 * SMALLER THAN THE OUTBOX'S 25, and the number comes from the route rather
 * than from taste: this rides the every-minute expire-orders cron, whose
 * `maxDuration` is 30 seconds and which already spends part of that sweeping
 * orders and reaping reservations. Each row here is a provider round trip and,
 * on success, a `markPaid` that settles an order and fans out payouts. A batch
 * that could not finish inside the budget would be killed part way — which is
 * precisely the lost-response state this whole mechanism exists to get out of,
 * reintroduced by the thing meant to fix it. Depth recovers over several
 * minutes instead, visibly, in the cron heartbeat.
 */
const BATCH = 10;

/** Backoff after an inconclusive pass, in minutes, by attempt. */
const BACKOFF_MINUTES = [5, 15, 30, 60, 120];

export function recoveryBackoffMs(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[index] * 60_000;
}

export type RecoverySummary = {
  claimed: number;
  /** The provider said the money landed and the order was completed. */
  settled: number;
  /** The provider said nothing landed and the balance was handed back. */
  released: number;
  /** Still in flight at the provider, or the provider could not be asked. */
  inconclusive: number;
  /** The answer was terminal but we could not act on it. A person is needed. */
  stuck: number;
};

type ClaimedRow = {
  transaction_id: string;
  tenant_id: string;
  order_id: string | null;
  payment_request_id: string;
  reservation_id: string | null;
  gross_amount_cents: number;
  currency: string;
  requested_at: string;
  attempts: number;
};

/**
 * Ask the provider about every stale collection in one bounded batch.
 *
 * BOUNDED, NOT DRAIN-TO-EMPTY, for the reason the outbox worker states: a
 * worker that loops until the queue is empty turns one bad day into one request
 * that runs until the platform kills it, and being killed mid-recovery is the
 * one state this whole mechanism exists to get out of.
 */
export async function recoverUnresolvedCollections(
  admin: Admin,
  deps: RecoverCollectionsDeps = {},
  options: { limit?: number; staleSeconds?: number } = {},
): Promise<RecoverySummary> {
  const summary: RecoverySummary = {
    claimed: 0,
    settled: 0,
    released: 0,
    inconclusive: 0,
    stuck: 0,
  };

  if (typeof admin.rpc !== "function") {
    logServerError(
      "pos.recoverCollections",
      "the recovery client cannot call pos_claim_stale_collections; refusing rather than reconciling unclaimed",
    );
    return summary;
  }

  const { data, error } = await admin.rpc("pos_claim_stale_collections", {
    p_limit: options.limit ?? BATCH,
    p_stale_seconds: options.staleSeconds ?? RECOVERY_STALE_SECONDS,
    p_visibility_seconds: RECOVERY_VISIBILITY_SECONDS,
  });
  if (error) {
    logServerError("pos.recoverCollections.claim", error);
    return summary;
  }

  const rows = (data ?? []) as ClaimedRow[];
  summary.claimed = rows.length;

  const probe: RecoveryProbe =
    deps.probe ?? ((requestId) => stripeCollectionAdapter().retrieveState(requestId));

  for (const row of rows) {
    const outcome = await resolveOne(admin, row, probe, deps);
    summary[outcome] += 1;
  }

  return summary;
}

type Outcome = "settled" | "released" | "inconclusive" | "stuck";

async function resolveOne(
  admin: Admin,
  row: ClaimedRow,
  probe: RecoveryProbe,
  deps: RecoverCollectionsDeps,
): Promise<Outcome> {
  let snapshot: PaymentRequestSnapshot | { ok: false; error: string };
  try {
    snapshot = await probe(row.payment_request_id);
  } catch (err) {
    // A throw is not an answer. Same treatment as a refusal: nothing changes.
    logServerError("pos.recoverCollections.probe", err);
    await inconclusive(admin, row, "unknown", err instanceof Error ? err.message : String(err));
    return "inconclusive";
  }

  if ("ok" in snapshot && snapshot.ok === false) {
    await inconclusive(admin, row, "unknown", snapshot.error);
    return "inconclusive";
  }

  const state = (snapshot as PaymentRequestSnapshot).state;
  const reference = (snapshot as PaymentRequestSnapshot).paymentReference ?? null;

  if (state === "succeeded") return settle(admin, row, reference, deps);
  if (state === "failed" || state === "cancelled") return release(admin, row, state, deps);

  // `created`, `pending`, `refunded` and `unknown` all mean DO NOTHING, and
  // `refunded` is the interesting one: the money moved and came back, so the
  // order was never completed and completing it now would settle a sale that
  // has already been returned. That is a human's decision, not this worker's,
  // and the row stays in the exceptions inbox wearing its answer.
  await inconclusive(admin, row, state, null);
  return "inconclusive";
}

async function settle(
  admin: Admin,
  row: ClaimedRow,
  paymentReference: string | null,
  deps: RecoverCollectionsDeps,
): Promise<Outcome> {
  const paid = deps.markPaid ?? markPaid;
  const result = await paid(row.transaction_id, { paymentIntentId: paymentReference });
  if (!result.ok) {
    // The provider says the customer was charged and our own transition
    // refused. NOT retried into a second attempt at anything: the money is
    // real, so this is recorded as the answer and left for a person.
    logServerError(
      "pos.recoverCollections.SETTLE_REFUSED_AFTER_PROVIDER_SUCCESS",
      `transaction ${row.transaction_id}: the provider confirms this collection succeeded but the `
        + `paid transition refused (${result.error}). The customer HAS been charged. Needs a human.`,
    );
    await record(admin, row, { last_state: "succeeded", last_error: result.error });
    return "stuck";
  }
  // `markPaid` closes the collection reservation itself, at the moment the row
  // actually reaches paid, exactly as it does for the webhook. Doing it again
  // here would be a second closer for one claim.
  await record(admin, row, {
    last_state: "succeeded",
    last_error: null,
    resolved_at: new Date().toISOString(),
    claimed_at: null,
  });
  return "settled";
}

async function release(
  admin: Admin,
  row: ClaimedRow,
  state: PaymentRequestState,
  deps: RecoverCollectionsDeps,
): Promise<Outcome> {
  const fail = deps.markFailed ?? markFailed;
  const failed = await fail(row.transaction_id, `pos_recovery_${state}`);
  if (!failed.ok) {
    // The balance is NOT handed back on a failed transition. A released claim
    // over a transaction still reading `payment_requested` would let a second
    // till take the same balance while the first row still looks payable, and
    // the whole point of the claim is that those two facts move together.
    logServerError(
      "pos.recoverCollections.FAILED_TRANSITION_REFUSED",
      `transaction ${row.transaction_id}: the provider says this collection ${state} but the failed `
        + `transition refused (${failed.error}). The balance stays claimed until its TTL. Needs a human.`,
    );
    await record(admin, row, { last_state: state, last_error: failed.error });
    return "stuck";
  }

  if (row.reservation_id) {
    const handBack = deps.release ?? releaseCollectionReservation;
    const handedBack = await handBack(admin, row.reservation_id);
    if (!handedBack.ok) {
      // The money is correctly recorded as not taken; only the claim is stuck,
      // and the reaper frees it at the TTL. So this is resolved for the
      // customer and logged for us rather than parked as an exception.
      logServerError(
        "pos.recoverCollections.reservation",
        `transaction ${row.transaction_id}: marked ${state} but reservation ${row.reservation_id} `
          + `did not release (${handedBack.reason}); the TTL reaper will free it`,
      );
    }
  }

  await record(admin, row, {
    last_state: state,
    last_error: null,
    resolved_at: new Date().toISOString(),
    claimed_at: null,
  });
  return "released";
}

/**
 * Nothing changed. Count the attempt and come back later.
 *
 * The attempt was already counted by the claim; what this writes is the answer
 * and the next time to ask. `resolved_at` stays null on purpose — an
 * inconclusive pass has resolved nothing, and a row that said otherwise would
 * disappear from the exceptions inbox while the money was still unaccounted
 * for.
 */
async function inconclusive(
  admin: Admin,
  row: ClaimedRow,
  state: PaymentRequestState,
  error: string | null,
): Promise<void> {
  await record(admin, row, {
    last_state: state,
    last_error: error,
    claimed_at: null,
    next_attempt_at: new Date(Date.now() + recoveryBackoffMs(row.attempts)).toISOString(),
  });
}

async function record(
  admin: Admin,
  row: ClaimedRow,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("pos_collection_recoveries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("transaction_id", row.transaction_id);
  if (error) logServerError("pos.recoverCollections.record", error);
}
