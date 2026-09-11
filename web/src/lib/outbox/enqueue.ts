import "server-only";

/**
 * enqueue.ts — write a durable side effect down before anyone tries to do it.
 *
 * THE PROBLEM THIS SOLVES IS NOT "RETRY". `failed_engine_effects` already
 * retries, and it stays exactly where it is, owning inquiry-engine listener
 * failures — the NOT NULL `inquiry_id` is that table saying what it is for.
 *
 * What it cannot do is notice an effect that never got attempted. It records
 * failures, so a crash between "the order is paid" and "the listener ran"
 * leaves no row: nothing observed the failure, so there is nothing to retry,
 * and the receipt is simply never sent. Nobody finds out from the system —
 * they find out from the customer.
 *
 * The outbox inverts that. The message is written as part of the work that
 * caused it, so the effect is durable BEFORE delivery is attempted, and a
 * crash anywhere after that point leaves a pending row a worker will pick up.
 *
 * DEDUPE KEYS ARE THE INTERESTING PART. Enqueueing frequently happens inside a
 * command that is itself retried, so without a key three retries of one paid
 * order produce three receipt emails — the outbox would have turned a
 * reliability mechanism into a spam mechanism. The key is the caller's
 * statement of what makes two enqueues the same effect (`order:<id>:receipt`),
 * and the partial unique index enforces it.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { OutboxTopic } from "./topics";

export type Admin = {
  // `outbox_messages` is newer than the generated database.types.ts, and tests
  // inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, args?: Record<string, unknown>) => any;
};

export type EnqueueInput = {
  tenantId: string;
  topic: OutboxTopic;
  payload?: Record<string, unknown>;
  /**
   * What makes two enqueues the same effect. Strongly recommended and not
   * required: some effects genuinely are per-occurrence (an audit ping), and
   * forcing a synthetic key on those would only produce keys nobody can reason
   * about.
   */
  dedupeKey?: string | null;
  correlationId?: string | null;
};

export type EnqueueResult =
  /** Written now. */
  | { ok: true; id: string; deduplicated: false }
  /** An identical effect was already queued or already delivered. */
  | { ok: true; id: null; deduplicated: true }
  | { ok: false };

/**
 * NEVER THROWS. An enqueue failure must not take down the command that caused
 * it — a paid order whose receipt could not be queued is still a paid order,
 * and rolling the payment back over a queue write would be a strictly worse
 * outcome for the customer than a late receipt.
 *
 * The failure is logged and reported in the return value so a caller that CAN
 * do something about it (surface a warning, raise an exception row) has the
 * choice. Most callers correctly ignore it.
 */
export async function enqueueOutbox(
  admin: Admin,
  input: EnqueueInput,
): Promise<EnqueueResult> {
  if (!input.tenantId || !input.topic) return { ok: false };
  try {
    const { data, error } = await admin
      .from("outbox_messages")
      .insert({
        tenant_id: input.tenantId,
        topic: input.topic,
        payload: (input.payload ?? {}) as never,
        dedupe_key: input.dedupeKey ?? null,
        correlation_id: input.correlationId ?? null,
      })
      .select("id")
      .maybeSingle();

    if (!error && data) {
      return { ok: true, id: (data as { id: string }).id, deduplicated: false };
    }
    // 23505 on the dedupe index is the mechanism WORKING, not an error. It is
    // the difference between one receipt and three.
    if (error && (error as { code?: string }).code === "23505") {
      return { ok: true, id: null, deduplicated: true };
    }
    logServerError("outbox/enqueue", error);
    return { ok: false };
  } catch (error) {
    logServerError("outbox/enqueue", error);
    return { ok: false };
  }
}
