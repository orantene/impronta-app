import "server-only";

/**
 * drain.ts — take due messages and perform them, once per poll.
 *
 * THE CLAIM IS AN RPC, NOT A SELECT PLUS AN UPDATE. Read-then-write leaves a
 * window in which two overlapping cron runs both read the same row and both
 * deliver it. The ticket-refund cron works around that with a conditional
 * UPDATE and accepts that the loser wasted a round trip; at queue volumes that
 * becomes every worker fighting over the head of one queue while the tail
 * grows. `claim_outbox_messages` uses `FOR UPDATE SKIP LOCKED`, so the second
 * worker takes the NEXT row rather than losing a race for the first.
 *
 * DELIVERY IS AT-LEAST-ONCE AND HANDLERS MUST BE IDEMPOTENT. This is not a
 * caveat, it is the contract. The claim pushes `next_attempt_at` forward before
 * the handler runs, so a worker that dies mid-delivery returns the message
 * after the backoff rather than leaving it parked forever — which means a
 * handler that half-completed will be asked again. Every handler registered
 * here has to survive that; a handler that cannot is a handler that belongs
 * behind a command envelope first.
 *
 * A HANDLER MAY REFUSE PERMANENTLY. `{ ok: false, permanent: true }` skips the
 * remaining attempts and goes straight to `dead`, because eleven more retries
 * of "that order does not exist" is eleven more hours of a queue depth nobody
 * can read. Transient failures keep their retries.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./enqueue";
import { OUTBOX_MAX_ATTEMPTS, outboxBackoffMs, type OutboxTopic } from "./topics";

export type OutboxMessage = {
  id: string;
  tenant_id: string;
  topic: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  correlation_id: string | null;
  attempt_count: number;
};

export type HandlerResult =
  | { ok: true }
  /** Retry after the backoff. */
  | { ok: false; error: string }
  /** Never retry: the cause cannot resolve itself. */
  | { ok: false; error: string; permanent: true };

export type OutboxHandler = (
  admin: Admin,
  message: OutboxMessage,
) => Promise<HandlerResult>;

export type OutboxRegistry = Partial<Record<OutboxTopic, OutboxHandler>>;

export type DrainSummary = {
  claimed: number;
  delivered: number;
  retrying: number;
  dead: number;
  unhandled: number;
};

/**
 * An unregistered topic is a PERMANENT failure, not a transient one.
 *
 * The tempting alternative is to leave it pending so a deploy that adds the
 * handler picks it up. That is how a queue silently fills with messages nobody
 * is coming for: the topic set is closed at the type level, so a message with
 * no handler is a deploy that removed one, and the honest response is to stop
 * retrying and put it where a person will see it.
 */
const UNHANDLED_ERROR = "no handler registered for this topic";

export async function drainOutbox(
  admin: Admin,
  registry: OutboxRegistry,
  options: { limit?: number; topics?: OutboxTopic[] } = {},
): Promise<DrainSummary> {
  const summary: DrainSummary = {
    claimed: 0,
    delivered: 0,
    retrying: 0,
    dead: 0,
    unhandled: 0,
  };

  const claimed = await admin.rpc("claim_outbox_messages", {
    p_limit: options.limit ?? 25,
    p_topics: options.topics ?? null,
  });

  if (claimed.error) {
    logServerError("outbox/drain.claim", claimed.error);
    return summary;
  }

  const messages = (claimed.data ?? []) as OutboxMessage[];
  summary.claimed = messages.length;

  for (const message of messages) {
    const handler = registry[message.topic as OutboxTopic];
    const result: HandlerResult = handler
      ? await runHandler(admin, handler, message)
      : { ok: false, error: UNHANDLED_ERROR, permanent: true };

    if (result.ok) {
      await settle(admin, message.id, {
        status: "delivered",
        delivered_at: new Date().toISOString(),
        last_error: null,
      });
      summary.delivered += 1;
      continue;
    }

    if (!handler) summary.unhandled += 1;

    const permanent =
      ("permanent" in result && result.permanent === true) ||
      message.attempt_count >= OUTBOX_MAX_ATTEMPTS;

    if (permanent) {
      await settle(admin, message.id, { status: "dead", last_error: result.error });
      summary.dead += 1;
      continue;
    }

    await settle(admin, message.id, {
      status: "pending",
      last_error: result.error,
      next_attempt_at: new Date(
        Date.now() + outboxBackoffMs(message.attempt_count),
      ).toISOString(),
      claimed_at: null,
    });
    summary.retrying += 1;
  }

  return summary;
}

/**
 * A handler that throws is a handler that failed transiently, not a crash of
 * the drain. One bad message must not stop the other twenty-four in the batch
 * — a queue that stalls entirely on its head is a queue with a single point of
 * failure per message.
 */
async function runHandler(
  admin: Admin,
  handler: OutboxHandler,
  message: OutboxMessage,
): Promise<HandlerResult> {
  try {
    return await handler(admin, message);
  } catch (error) {
    logServerError(`outbox/${message.topic}`, error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function settle(
  admin: Admin,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("outbox_messages").update(patch).eq("id", id);
  if (error) logServerError("outbox/drain.settle", error);
}
