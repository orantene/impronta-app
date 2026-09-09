/**
 * topics.ts — the outbox's namespace, and the reason it is closed.
 *
 * A free-text topic column would let any caller invent a topic, and an
 * invented topic is a message nothing is registered to handle: it claims, it
 * fails, it backs off, it dies, and the only signal is a row in a table nobody
 * opened. Closing the set makes an unhandled topic a TYPE error at the call
 * site instead of a dead letter in production.
 *
 * PURE, so client components, tests and the enqueue path can all share it
 * without pulling `server-only` into a bundle.
 */

export const OUTBOX_TOPICS = [
  /** A ticket refund intent exists and wants executing. */
  "refund.intent_created",
  /** An order reached `paid`; receipts, admissions and dispatch hang off this. */
  "order.paid",
  /** An event was cancelled; buyers need telling. */
  "event.cancelled",
  /** A preparation ticket changed state and a station needs the delta. */
  "preparation.dispatch",
  /** Something crossed into the Exceptions inbox and an owner should know. */
  "exception.raised",
] as const;

export type OutboxTopic = (typeof OUTBOX_TOPICS)[number];

export function isOutboxTopic(raw: string): raw is OutboxTopic {
  return (OUTBOX_TOPICS as readonly string[]).includes(raw);
}

/**
 * Give up after this many attempts and mark the message `dead`.
 *
 * Not "retry forever": a message that has failed twelve times over a widening
 * backoff is not going to succeed on the thirteenth, and a queue that never
 * gives up is a queue whose depth stops meaning anything. `dead` is a
 * deliberate state a human resolves from the Exceptions inbox, which is the
 * difference between a dropped effect and a known one.
 */
export const OUTBOX_MAX_ATTEMPTS = 12;

/**
 * Exponential backoff with a ceiling, in milliseconds.
 *
 * The ceiling matters more than the curve. Uncapped doubling reaches days by
 * attempt fifteen, which means a transient outage that resolves in an hour
 * still leaves messages parked until tomorrow — the retry schedule becomes the
 * outage. One hour is long enough not to hammer a broken dependency and short
 * enough that recovery is measured in one poll.
 */
export function outboxBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.trunc(attempt));
  return Math.min(60 * 60_000, 30_000 * 2 ** (n - 1));
}
