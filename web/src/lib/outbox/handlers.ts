import "server-only";

/**
 * handlers.ts — the registry the drain consults, and the one place a topic
 * becomes an effect.
 *
 * A SMALL REGISTRY ON PURPOSE. The temptation with an outbox is to move every
 * existing side effect onto it in the same change, and that is how a
 * reliability mechanism becomes a rewrite: each move is a behaviour change to a
 * path that currently works, and none of them can be verified against the
 * queue until the queue itself is trusted.
 *
 * So the outbox lands with the topics whose effect ALREADY has an idempotent,
 * already-tested executor behind it. The queue's job here is to make the
 * effect durable and observable, not to reimplement it. Topics whose executor
 * does not exist yet are declared in `topics.ts` and registered as milestones
 * reach them — and an unregistered topic is a permanent failure in the drain,
 * so a message for one is visible immediately rather than accumulating.
 *
 * EVERY HANDLER HERE IS SAFE TO RUN TWICE. Delivery is at-least-once; a
 * handler that is not idempotent will eventually double an effect, and the
 * drain cannot protect it.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./enqueue";
import type { HandlerResult, OutboxHandler, OutboxMessage, OutboxRegistry } from "./drain";

/**
 * `refund.intent_created` — nudge the refund pipeline rather than perform it.
 *
 * The handler DOES NOT refund. `/api/cron/ticket-refund-intents` already owns
 * that, with claim-before-execute, an attempt cap and a `partial_failure`
 * outcome that deliberately never retries because money moved. Re-implementing
 * any of that here would give one refund two executors racing over the same
 * intent row, which is the exact failure the claim guard exists to prevent.
 *
 * What this DOES is verify the intent is real and still pending, so the queue
 * carries an honest signal: `delivered` means an executable intent exists;
 * `dead` means it was already handled or never existed. That is what makes the
 * Exceptions inbox able to tell "refund pending" from "refund lost".
 */
const refundIntentCreated: OutboxHandler = async (admin, message) => {
  const intentId = String(message.payload?.intentId ?? "");
  if (!intentId) {
    return { ok: false, error: "payload has no intentId", permanent: true };
  }
  const { data, error } = await admin
    .from("ticket_refund_intents")
    .select("id, executed_at")
    .eq("id", intentId)
    .eq("tenant_id", message.tenant_id)
    .maybeSingle();
  if (error) {
    logServerError("outbox/refund.intent_created", error);
    return { ok: false, error: "could not read the refund intent" };
  }
  if (!data) {
    return { ok: false, error: "no such refund intent on this workspace", permanent: true };
  }
  return { ok: true };
};

/**
 * `exception.raised` — the acknowledgement that an exception is recorded.
 *
 * It performs no notification. Deciding WHO gets told, through which channel,
 * for which severity is the Exceptions inbox's own model, and pre-empting it
 * from the queue would put routing rules in two places before either exists.
 * Delivery here means the exception is durable and the inbox will show it.
 */
const exceptionRaised: OutboxHandler = async (_admin, message) => {
  const kind = String(message.payload?.kind ?? "");
  if (!kind) return { ok: false, error: "payload has no kind", permanent: true };
  return { ok: true };
};

export const OUTBOX_HANDLERS: OutboxRegistry = {
  "refund.intent_created": refundIntentCreated,
  "exception.raised": exceptionRaised,
};

/** Re-exported so the cron route does not have to know two module paths. */
export type { Admin, HandlerResult, OutboxMessage };
