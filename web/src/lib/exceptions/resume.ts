import "server-only";

/**
 * resume.ts — the five buttons, and why only one performs the effect.
 *
 * FOUR OF THESE ARM A WORKER RATHER THAN DOING THE WORK, ON PURPOSE. Every
 * one of the executors behind these rows already exists, already claims before
 * it acts, and already has an attempt cap: the refund cron claims on
 * `claimed_at`, the engine retry is keyed on `(event_id, listener_name)`, the
 * outbox claims under `FOR UPDATE SKIP LOCKED`. A button that ran the effect
 * inline would give one row TWO executors, and the second one would be a
 * screen with no claim guard at all — reintroducing exactly the double-refund
 * these mechanisms were built to prevent, from the one surface an operator
 * presses when they are already worried.
 *
 * So the buttons make a row eligible again and the worker picks it up on its
 * next pass, which is under a minute for all three. The one exception is
 * minting, and it is an exception because `admissions (order_line_id, line_seq)`
 * is UNIQUE: minting cannot double-issue, so there is nothing to protect and
 * an operator standing at a door should not wait a minute for a ticket.
 *
 * EVERY BUTTON GOES THROUGH `runCommand`. Not because the executors are unsafe
 * — they are — but because the operator is on a slow connection looking at a
 * row that says a customer has no ticket, and they WILL press it three times.
 * The idempotency claim turns those three into one and the other two into
 * "your first one is still going", which is the honest answer.
 *
 * ARMING IS NOT UNBOUNDED. `retry_engine_effect` on an exhausted row grants
 * exactly ONE more attempt rather than resetting the counter: a reset would let
 * an operator loop a permanently broken effect forever, and the cap exists
 * because at some point the answer is a person, not another try.
 *
 * A FAILED READ AND A FAILED WRITE ARE NOT THE SAME FAILURE. Every branch here
 * used to collapse into `reason: "failed"`, which the screen rendered as
 * "Nothing was changed." That is true of a SELECT that errored and is a lie
 * about an UPDATE that errored, because an UPDATE can fail on the way back
 * from a row it already changed. So reads throw `CommandFailure("none", ...)`
 * and writes throw `CommandFailure("unknown", ...)`, and the operator is told
 * to go and look rather than reassured.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { makeEnvelope } from "@/lib/commands/envelope";
import { CommandFailure, runCommand } from "@/lib/commands/run";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";
import { paymentRequestIdFromMetadata } from "@/lib/pos/collection-reservations";
import type { ResumeVerb } from "./model";

type Admin = SupabaseClient;

/**
 * Kept in step with the refund cron's own cap. Arming sets `attempts` to one
 * below it, which is what "one more pass" means for that worker.
 */
const REFUND_MAX_ATTEMPTS = 12;

/** Kept in step with `inquiry-engine-lifecycle.ts`. Same reasoning. */
const ENGINE_MAX_RETRY_ATTEMPTS = 5;

/**
 * Why a resume did not happen. The last three come from the command runner
 * rather than from the row, and they are separate values because they need
 * three different sentences: `failed` is the only one that may tell an
 * operator nothing changed.
 */
export type ResumeFailureReason =
  | "not_found"
  | "not_resumable"
  /** Nothing was written. The handler asserted it. */
  | "failed"
  | "in_flight"
  /** Some of it landed and we know which part. */
  | "partial"
  /** It may have landed. Nobody can say. */
  | "uncertain"
  /** Another runner took this claim over while ours was still working. */
  | "fenced";

export type ResumeResult =
  | { ok: true; outcome: "armed" | "done" | "already" }
  | {
      ok: false;
      reason: ResumeFailureReason;
      /**
       * The runner's own sentence, when the runner is the one that knows. The
       * screen prefers it over anything it could compose from `reason` alone,
       * because only the runner knows which part of a partial landed.
       */
      message?: string;
    };

export type ResumeInput = {
  tenantId: string;
  verb: ResumeVerb;
  /** The row's id in its own source table. */
  sourceId: string;
  actorUserId: string | null;
  /**
   * The operator's intent, stable across a double-tap. Supplied by the caller
   * because only the caller knows whether two clicks were one intent or two.
   */
  idempotencyKey: string;
};

export async function resumeException(
  admin: Admin,
  input: ResumeInput,
): Promise<ResumeResult> {
  const envelope = makeEnvelope({
    command: `exceptions.${input.verb}`,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
  });

  const outcome = await runCommand(admin, envelope, { sourceId: input.sourceId }, () =>
    perform(admin, input),
  );

  switch (outcome.status) {
    case "ok":
    case "replayed":
      return outcome.result;
    case "in_flight":
      return { ok: false, reason: "in_flight" };
    case "conflict":
      // The same key was reused for a different row: a client bug, and nothing
      // ran, so nothing changed.
      return { ok: false, reason: "failed" };
    case "fenced":
      return { ok: false, reason: "fenced", message: outcome.error };
    case "error":
      return {
        ok: false,
        reason:
          outcome.effects === "none"
            ? "failed"
            : outcome.effects === "partial"
              ? "partial"
              : "uncertain",
        message: outcome.error,
      };
  }
}

function perform(admin: Admin, input: ResumeInput): Promise<ResumeResult> {
  switch (input.verb) {
    case "run_refund_intent":
      return armRefundIntent(admin, input.tenantId, input.sourceId);
    case "mint_missing_admissions":
      return mintMissing(admin, input.tenantId, input.sourceId);
    case "retry_engine_effect":
      return armEngineEffect(admin, input.tenantId, input.sourceId);
    case "requeue_outbox_message":
      return requeueOutbox(admin, input.tenantId, input.sourceId);
    case "recover_unresolved_collection":
      return armCollectionRecovery(admin, input.tenantId, input.sourceId);
  }
}

/**
 * Ask the recovery worker to ask the provider, sooner than it would have.
 *
 * IT DOES NOT ASK THE PROVIDER ITSELF, and that is the same rule the other
 * arming verbs follow for the same reason: `pos_claim_stale_collections` takes
 * a lease under `FOR UPDATE SKIP LOCKED` precisely so that one transaction is
 * reconciled by one worker at a time, and a button that called the provider
 * inline would be a second reconciler with no lease at all. The answer it got
 * could then race the cron's answer, and the action on `succeeded` is
 * `markPaid` — an order completed twice, from the one screen an operator
 * presses when they are already worried.
 *
 * IT CANNOT CHARGE ANYBODY EITHER WAY. What it writes is a due time. The only
 * code that talks to the provider from here is the worker, and the worker has
 * no create in scope.
 *
 * A ROW WITH NO RECOVERY YET IS ALREADY ELIGIBLE. The claim enrols stale
 * transactions on its own pass, so there is nothing to arm and nothing to
 * write: saying `already` is the truthful answer rather than inserting a row
 * whose only effect would be to duplicate what the claim does.
 */
async function armCollectionRecovery(
  admin: Admin,
  tenantId: string,
  transactionId: string,
): Promise<ResumeResult> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("id, status, source_tenant_id, metadata")
    .eq("id", transactionId)
    // `source_tenant_id`, not `tenant_id`: this table predates the convention
    // and names the workspace that took the money under its own column.
    .eq("source_tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw new CommandFailure("none", `could not read the collection: ${error.message}`);
  }
  if (!data) return { ok: false, reason: "not_found" };
  // Anything but `payment_requested` has resolved itself while this screen was
  // open, and re-arming would ask about a payment that has an answer.
  if (data.status !== "payment_requested") return { ok: true, outcome: "already" };
  if (!paymentRequestIdFromMetadata((data as { metadata?: unknown }).metadata)) {
    // Nothing to ask about. The model routes this row to `inspect`, so this is
    // the server-side half of that: a server action is reachable without the
    // screen that renders it, and "the UI would not offer it" is not a guard.
    return { ok: false, reason: "not_resumable" };
  }

  const { data: existing, error: rErr } = await admin
    .from("pos_collection_recoveries")
    .select("transaction_id, resolved_at")
    .eq("transaction_id", transactionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (rErr) {
    throw new CommandFailure("none", `could not read the recovery row: ${rErr.message}`);
  }
  if (!existing) {
    // Never reconciled, and nothing to write: the claim enrols stale askable
    // transactions on its own pass. `armed` rather than `already`, because
    // `already` renders as "nothing to do" and the truth is that the worker
    // WILL take this one on its next pass — the row only reaches this screen
    // once it is past the staleness window the claim uses, and that cron runs
    // every minute.
    return { ok: true, outcome: "armed" };
  }
  if (existing.resolved_at) return { ok: true, outcome: "already" };

  const { error: uErr } = await admin
    .from("pos_collection_recoveries")
    .update({
      next_attempt_at: new Date().toISOString(),
      // Dropping the lease is what makes "sooner" real: a claimed row is
      // skipped by the claim regardless of its due time.
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("transaction_id", transactionId)
    .eq("tenant_id", tenantId)
    .is("resolved_at", null);
  if (uErr) {
    throw new CommandFailure("unknown", `the recovery arm did not confirm: ${uErr.message}`);
  }
  return { ok: true, outcome: "armed" };
}

/**
 * REFUSES A CLAIMED ROW, and that refusal is the whole point of the function.
 *
 * The model already routes a claimed intent to `inspect` rather than `resume`,
 * so this cannot normally be reached — which is exactly why it is checked
 * here too. A server action is reachable without the screen that renders it,
 * and "the UI would not offer it" is not a guard.
 */
async function armRefundIntent(
  admin: Admin,
  tenantId: string,
  intentId: string,
): Promise<ResumeResult> {
  const { data, error } = await admin
    .from("ticket_refund_intents")
    .select("id, claimed_at, executed_at, attempts")
    .eq("id", intentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw new CommandFailure("none", `could not read the refund intent: ${error.message}`);
  }
  if (!data) return { ok: false, reason: "not_found" };
  if (data.executed_at || data.claimed_at) return { ok: false, reason: "not_resumable" };

  const attempts = Number(data.attempts ?? 0);
  if (attempts < REFUND_MAX_ATTEMPTS) {
    // The cron will already take it on its next pass. Saying "armed" rather
    // than writing a no-op update keeps the row's attempt history honest.
    return { ok: true, outcome: "already" };
  }

  const { error: uErr } = await admin
    .from("ticket_refund_intents")
    .update({ attempts: REFUND_MAX_ATTEMPTS - 1, result: null })
    .eq("id", intentId)
    .eq("tenant_id", tenantId)
    .is("claimed_at", null);
  if (uErr) {
    // An UPDATE can fail on the way back from a row it already changed.
    throw new CommandFailure("unknown", `the refund intent update did not confirm: ${uErr.message}`);
  }
  return { ok: true, outcome: "armed" };
}

/**
 * The one button that performs its effect, because `admissions` has a unique
 * index on `(order_line_id, line_seq)` and a second mint conflicts instead of
 * duplicating. Re-minting the whole ORDER rather than the one line is
 * deliberate: a shortfall on one line is very often a shortfall on its
 * siblings, and the mint skips what already exists.
 */
async function mintMissing(
  admin: Admin,
  tenantId: string,
  orderLineId: string,
): Promise<ResumeResult> {
  const { data: line, error } = await admin
    .from("order_lines")
    .select("id, order_id")
    .eq("id", orderLineId)
    .maybeSingle();
  if (error) {
    throw new CommandFailure("none", `could not read the order line: ${error.message}`);
  }
  if (!line?.order_id) return { ok: false, reason: "not_found" };

  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, status")
    .eq("id", line.order_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (oErr) {
    throw new CommandFailure("none", `could not read the order: ${oErr.message}`);
  }
  // Tenant scope is enforced on the ORDER, because `order_lines` carries no
  // tenant column. A line whose order belongs to another workspace resolves to
  // no order here and is refused, which is the behaviour that matters.
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status !== "paid" && order.status !== "fulfilled") {
    return { ok: false, reason: "not_resumable" };
  }

  const { data: lines, error: lErr } = await admin
    .from("order_lines")
    .select("id, units, session_id, variant_id")
    .eq("order_id", order.id as string);
  if (lErr) {
    throw new CommandFailure("none", `could not read the order lines: ${lErr.message}`);
  }

  try {
    const result = await mintAdmissionsForPaidOrder(admin, {
      orderId: order.id as string,
      tenantId,
      lines: (lines ?? []).map((l) => ({
        id: l.id as string,
        units: Number(l.units ?? 0),
        sessionId: (l.session_id as string | null) ?? null,
        variantId: (l.variant_id as string | null) ?? null,
      })),
    });
    return { ok: true, outcome: result.rowsInserted > 0 ? "done" : "already" };
  } catch (mintError) {
    // The mint inserts per line and skips what exists. A throw part way
    // through leaves some issued and some not, and we cannot see which.
    throw new CommandFailure(
      "unknown",
      `minting stopped part way: ${mintError instanceof Error ? mintError.message : String(mintError)}`,
      { cause: mintError },
    );
  }
}

async function armEngineEffect(
  admin: Admin,
  tenantId: string,
  effectId: string,
): Promise<ResumeResult> {
  const { data, error } = await admin
    .from("failed_engine_effects")
    .select("id, resolved, attempt_count")
    .eq("id", effectId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw new CommandFailure("none", `could not read the engine effect: ${error.message}`);
  }
  if (!data) return { ok: false, reason: "not_found" };
  if (data.resolved) return { ok: true, outcome: "already" };

  const attempts = Number(data.attempt_count ?? 0);
  const { error: uErr } = await admin
    .from("failed_engine_effects")
    .update({
      // ONE more attempt, not a reset. The cap is a decision that at some
      // point a person is the answer; resetting it lets an operator loop a
      // permanently broken effect until the queue is all it contains.
      attempt_count: Math.min(attempts, ENGINE_MAX_RETRY_ATTEMPTS - 1),
      next_retry_at: new Date().toISOString(),
    })
    .eq("id", effectId)
    .eq("tenant_id", tenantId)
    .eq("resolved", false);
  if (uErr) {
    throw new CommandFailure("unknown", `the engine effect update did not confirm: ${uErr.message}`);
  }
  return { ok: true, outcome: "armed" };
}

async function requeueOutbox(
  admin: Admin,
  tenantId: string,
  messageId: string,
): Promise<ResumeResult> {
  const { data, error } = await admin
    .from("outbox_messages")
    .select("id, status")
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw new CommandFailure("none", `could not read the outbox message: ${error.message}`);
  }
  if (!data) return { ok: false, reason: "not_found" };
  if (data.status !== "dead") return { ok: true, outcome: "already" };

  const { error: uErr } = await admin
    .from("outbox_messages")
    .update({
      status: "pending",
      // The counter DOES reset here, unlike the engine effect, because a dead
      // outbox message has no other route back: the topic's handler either
      // exists now or the message dies again on the next pass, which is one
      // wasted attempt rather than an unbounded loop.
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
      claimed_at: null,
    })
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .eq("status", "dead");
  if (uErr) {
    throw new CommandFailure("unknown", `the outbox requeue did not confirm: ${uErr.message}`);
  }
  return { ok: true, outcome: "armed" };
}
