import "server-only";

/**
 * resume.ts — the four buttons, and why none of them performs the effect.
 *
 * THREE OF THESE ARM A WORKER RATHER THAN DOING THE WORK, ON PURPOSE. Every
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
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { makeEnvelope } from "@/lib/commands/envelope";
import { runCommand } from "@/lib/commands/run";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";
import type { ResumeVerb } from "./model";

type Admin = SupabaseClient;

/**
 * Kept in step with the refund cron's own cap. Arming sets `attempts` to one
 * below it, which is what "one more pass" means for that worker.
 */
const REFUND_MAX_ATTEMPTS = 12;

/** Kept in step with `inquiry-engine-lifecycle.ts`. Same reasoning. */
const ENGINE_MAX_RETRY_ATTEMPTS = 5;

export type ResumeResult =
  | { ok: true; outcome: "armed" | "done" | "already" }
  | { ok: false; reason: "not_found" | "not_resumable" | "failed" | "in_flight" };

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

  if (outcome.status === "ok" || outcome.status === "replayed") return outcome.result;
  if (outcome.status === "in_flight") return { ok: false, reason: "in_flight" };
  // A fingerprint conflict means the same key was reused for a different row —
  // a client bug, not something to guess at.
  return { ok: false, reason: "failed" };
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
  }
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
    logServerError("exceptions/armRefundIntent.read", error);
    return { ok: false, reason: "failed" };
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
    logServerError("exceptions/armRefundIntent.update", uErr);
    return { ok: false, reason: "failed" };
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
    logServerError("exceptions/mintMissing.line", error);
    return { ok: false, reason: "failed" };
  }
  if (!line?.order_id) return { ok: false, reason: "not_found" };

  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, status")
    .eq("id", line.order_id as string)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (oErr) {
    logServerError("exceptions/mintMissing.order", oErr);
    return { ok: false, reason: "failed" };
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
    logServerError("exceptions/mintMissing.lines", lErr);
    return { ok: false, reason: "failed" };
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
    logServerError("exceptions/mintMissing.mint", mintError);
    return { ok: false, reason: "failed" };
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
    logServerError("exceptions/armEngineEffect.read", error);
    return { ok: false, reason: "failed" };
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
    logServerError("exceptions/armEngineEffect.update", uErr);
    return { ok: false, reason: "failed" };
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
    logServerError("exceptions/requeueOutbox.read", error);
    return { ok: false, reason: "failed" };
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
    logServerError("exceptions/requeueOutbox.update", uErr);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, outcome: "armed" };
}
