import "server-only";

/**
 * run.ts — the one place a command's idempotency is decided.
 *
 * THE CLAIM COMES FIRST, AND THAT IS THE WHOLE DESIGN. The row goes in with
 * `status = 'in_flight'` BEFORE the handler runs, so a concurrent duplicate
 * loses the unique index and is told "still running" rather than running a
 * second copy. A results-only table cannot do that: by the time there is a
 * result to check against, both copies have already charged the card.
 *
 * FOUR OUTCOMES, AND EACH ONE IS A DIFFERENT SENTENCE TO A CALLER
 * ──────────────────────────────────────────────────────────────
 *   ok        the handler ran here, now. The result is the handler's.
 *   replayed  this exact intent already succeeded. Same result, no work. The
 *             caller cannot tell the difference and must not need to.
 *   in_flight another copy holds the claim. NOT an error and NOT a retry
 *             signal — the honest answer to a double-tap is "your first one is
 *             still going", and a client that retries on this makes a queue.
 *   conflict  the key was reused with different arguments. A refusal, because
 *             the alternative is returning request A's result to request B and
 *             calling it idempotency.
 *
 * A FAILED COMMAND RELEASES ITS CLAIM. `status = 'failed'` is retryable: the
 * next call with the same key takes the row over, increments `attempt_count`
 * and runs. Holding the claim forever would make a transient database blip
 * permanently un-retryable for that intent, which is worse than the duplicate
 * risk it would prevent — there is no duplicate risk, because nothing
 * succeeded.
 *
 * WHAT THIS IS NOT. It is not a distributed transaction. The handler's writes
 * and this table's writes are separate statements, so a crash between "handler
 * committed" and "row marked succeeded" leaves an in-flight claim over
 * completed work. That window is real and is why `STALE_CLAIM_MS` exists: an
 * in-flight claim older than the window is treated as abandoned and retried,
 * which is the right trade for handlers that are themselves idempotent, and is
 * exactly why every handler registered here has to be.
 */

import { logServerError } from "@/lib/server/safe-error";
import { fingerprintRequest, type CommandEnvelope } from "./envelope";

export type Admin = {
  // `command_idempotency` is newer than the generated database.types.ts, and
  // the runner's own tests inject a fake PostgREST builder — testing the claim
  // race against a real client is not possible in a unit lane, and this is the
  // one piece of machinery where the race IS the behaviour under test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type CommandOutcome<T> =
  | { status: "ok"; result: T }
  | { status: "replayed"; result: T }
  | { status: "in_flight" }
  | { status: "conflict"; reason: "fingerprint_mismatch" }
  | { status: "error"; error: string };

/**
 * How long an in-flight claim is believed before it is treated as abandoned.
 *
 * Long enough that a slow-but-alive handler is never stolen from — the longest
 * command in this system is a Stripe round trip inside a purchase, and those
 * are seconds. Short enough that an operator who crashed a tab does not have to
 * wait out a coffee break before the same button works again.
 */
export const STALE_CLAIM_MS = 5 * 60_000;

type ClaimRow = {
  id: string;
  status: "in_flight" | "succeeded" | "failed";
  request_fingerprint: string;
  result: unknown;
  created_at: string;
  attempt_count: number;
};

const CLAIM_COLUMNS = "id, status, request_fingerprint, result, created_at, attempt_count";

function isStale(row: ClaimRow, now: number): boolean {
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) && now - created > STALE_CLAIM_MS;
}

/**
 * Run a command exactly once per (tenant, command, idempotency key).
 *
 * `handler` receives the envelope so it can apply `expectedRevision` itself.
 * Deliberately: only the handler knows which row carries the revision and what
 * a mismatch means for that aggregate. A runner that tried to enforce it
 * generically would have to know every table's version column, and would get
 * it wrong first for whichever aggregate does not have one.
 */
export async function runCommand<T>(
  admin: Admin,
  envelope: CommandEnvelope,
  args: unknown,
  handler: (envelope: CommandEnvelope) => Promise<T>,
): Promise<CommandOutcome<T>> {
  const fingerprint = await fingerprintRequest(envelope, args);
  const now = Date.now();

  const claimed = await admin
    .from("command_idempotency")
    .insert({
      tenant_id: envelope.tenantId,
      command: envelope.command,
      idempotency_key: envelope.idempotencyKey,
      request_fingerprint: fingerprint,
      actor_user_id: envelope.actorUserId,
      correlation_id: envelope.correlationId,
      status: "in_flight",
    })
    .select("id")
    .maybeSingle();

  if (!claimed.error && claimed.data) {
    return execute(admin, envelope, (claimed.data as { id: string }).id, handler);
  }

  // A non-conflict insert error is infrastructure, not a duplicate. Refusing
  // here rather than running the handler anyway is deliberate: a command that
  // runs without a claim is a command with no idempotency at all, and the
  // caller would have no way to know its retry is now unsafe.
  if (claimed.error && !isUniqueViolation(claimed.error)) {
    logServerError("commands/runCommand.claim", claimed.error);
    return { status: "error", error: "Could not start that. Nothing was changed." };
  }

  const existingQuery = await admin
    .from("command_idempotency")
    .select(CLAIM_COLUMNS)
    .eq("tenant_id", envelope.tenantId)
    .eq("command", envelope.command)
    .eq("idempotency_key", envelope.idempotencyKey)
    .maybeSingle();
  if (existingQuery.error || !existingQuery.data) {
    logServerError("commands/runCommand.read", existingQuery.error);
    return { status: "error", error: "Could not start that. Nothing was changed." };
  }
  const existing = existingQuery.data as ClaimRow;

  // The fingerprint check comes BEFORE the status check on purpose. A key
  // reused with different arguments is wrong whatever state the first request
  // reached, and reporting "in flight" for it would send the caller into a
  // polling loop waiting for an answer that is not theirs.
  if (existing.request_fingerprint !== fingerprint) {
    return { status: "conflict", reason: "fingerprint_mismatch" };
  }

  if (existing.status === "succeeded") {
    return { status: "replayed", result: existing.result as T };
  }

  if (existing.status === "in_flight" && !isStale(existing, now)) {
    return { status: "in_flight" };
  }

  // Failed, or an in-flight claim old enough to be abandoned. Take it over.
  // The conditional `.eq("status", existing.status)` is what stops two
  // simultaneous takeovers: the loser updates zero rows and reports in_flight,
  // which is true — someone else just took it.
  const takeover = await admin
    .from("command_idempotency")
    .update({
      status: "in_flight",
      attempt_count: existing.attempt_count + 1,
      error_message: null,
      completed_at: null,
    })
    .eq("id", existing.id)
    .eq("status", existing.status)
    .select("id")
    .maybeSingle();
  if (takeover.error || !takeover.data) {
    return { status: "in_flight" };
  }

  return execute(admin, envelope, existing.id, handler);
}

async function execute<T>(
  admin: Admin,
  envelope: CommandEnvelope,
  claimId: string,
  handler: (envelope: CommandEnvelope) => Promise<T>,
): Promise<CommandOutcome<T>> {
  try {
    const result = await handler(envelope);
    const stamped = await admin
      .from("command_idempotency")
      .update({
        status: "succeeded",
        // `?? null` rather than the raw value: a handler returning `undefined`
        // would write SQL NULL either way, but going through it explicitly
        // means a replay hands back `null` and not `undefined`, so the replayed
        // and first-run shapes agree.
        result: (result ?? null) as never,
        completed_at: new Date().toISOString(),
      })
      .eq("id", claimId);
    if (stamped.error) {
      // The work IS done. Losing the stamp costs the replay path, not the
      // effect, so this is logged and the caller still gets their result —
      // the alternative (reporting failure on completed work) invites a retry
      // of something that already happened.
      logServerError("commands/runCommand.stamp", stamped.error);
    }
    return { status: "ok", result };
  } catch (error) {
    logServerError(`commands/${envelope.command}`, error);
    await admin
      .from("command_idempotency")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", claimId);
    return { status: "error", error: "That did not go through. Nothing was changed." };
  }
}

/**
 * Postgres 23505. Matched on the code and not on the message, because the
 * message is localised by server settings and a locale change would silently
 * turn every duplicate into an infrastructure error.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}
