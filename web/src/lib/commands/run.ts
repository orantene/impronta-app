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
 * THE CLAIM IS A LEASE, NOT A TIMESTAMP. It used to be decided here, in
 * TypeScript, by comparing `created_at` against a constant. Three defects fell
 * out of that one shape and all three are fixed in `command_claim`:
 *
 *   1. Nothing recorded WHO held the claim, so two runners could each judge it
 *      stale, each write 'in_flight' over 'in_flight', and both believe they
 *      had won. The compare-and-set compared a value to itself.
 *   2. The stamp was `UPDATE ... WHERE id = claim`, which succeeds for whoever
 *      runs it last. A runner taken over mid-handler would overwrite the
 *      winner's result, and every later replay handed out the loser's.
 *   3. Age is not liveness. `created_at` says when work STARTED. The same five
 *      minute constant was too short for a slow handler and too long for a
 *      crashed tab.
 *
 * Now the row carries an `owner_token` minted per ATTEMPT and a
 * `lease_expires_at` the owner refreshes while it works. Takeover is a
 * compare-and-set on the expired lease and mints a new token, and
 * `command_complete` refuses a token that no longer matches. A crashed owner
 * that comes back to life cannot stamp.
 *
 * SIX OUTCOMES, AND EACH ONE IS A DIFFERENT SENTENCE TO A CALLER
 * ─────────────────────────────────────────────────────────────
 *   ok        the handler ran here, now. The result is the handler's.
 *   replayed  this exact intent already succeeded. Same result, no work. The
 *             caller cannot tell the difference and must not need to.
 *   in_flight another copy holds a LIVE lease. NOT an error and NOT a retry
 *             signal — the honest answer to a double-tap is "your first one is
 *             still going", and a client that retries on this makes a queue.
 *   conflict  the key was reused with different arguments. A refusal, because
 *             the alternative is returning request A's result to request B and
 *             calling it idempotency.
 *   fenced    we were taken over WHILE THE HANDLER RAN. Surfaced, never
 *             swallowed: another runner may be performing the same work right
 *             now, so neither "it worked" nor "it failed" is a thing we know.
 *   error     the handler refused or threw, carrying `effects`.
 *
 * `effects` IS WHAT EARNS THE COPY. The old failure path said "Nothing was
 * changed" on every throw, which is a sentence this code had no standing to
 * say: a handler that wrote three rows and then threw changed a great deal. A
 * handler now declares what it did by throwing `CommandFailure`, a plain throw
 * is recorded as 'unknown', and only 'none' gets the reassuring sentence.
 *
 * WHAT THIS IS NOT. It is not a distributed transaction. The handler's writes
 * and the claim's writes are separate statements, so a crash between "handler
 * committed" and "row marked succeeded" still leaves an in-flight claim over
 * completed work. That window is now VISIBLE rather than silently reclaimed:
 * the lease runs out, the Exceptions inbox lists the claim as an inspectable
 * row, and the next identical request takes it over — which is only safe
 * because every handler registered here has to be idempotent.
 */

import { logServerError } from "@/lib/server/safe-error";
import { fingerprintRequest, type CommandEnvelope } from "./envelope";

export type Admin = {
  // `command_idempotency` and its RPCs are newer than the generated
  // database.types.ts, and the runner's own tests inject a fake rpc — testing
  // the claim race against a real client is not possible in a unit lane, and
  // this is the one piece of machinery where the race IS the behaviour under
  // test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, args?: Record<string, unknown>) => any;
};

/**
 * What a handler asserts about the world after it failed.
 *
 * There is no 'done' here on purpose: a handler that finished does not report
 * effects, it returns a result. 'done' exists only in the database column, so
 * that a settled row and an in-flight one are distinguishable in one read.
 */
export type CommandEffects = "none" | "partial" | "unknown";

/**
 * What the handler is given besides its envelope.
 *
 * `heartbeat` is here because a lease short enough to free a crashed tab
 * quickly is shorter than the slowest legitimate command. A handler that knows
 * it will run long says so; one that does not is covered by the runner's own
 * timer. It resolves FALSE once the claim has been taken over, which is the
 * earliest honest moment a handler can learn to stop.
 */
export type CommandContext = {
  claimId: string;
  ownerToken: string;
  heartbeat: () => Promise<boolean>;
};

export type CommandHandler<T> = (
  envelope: CommandEnvelope,
  context: CommandContext,
) => Promise<T>;

export type CommandOutcome<T> =
  | { status: "ok"; result: T }
  | { status: "replayed"; result: T; revision: number | null }
  | { status: "in_flight"; leaseExpiresAt: string | null }
  | { status: "conflict"; reason: "fingerprint_mismatch" }
  | { status: "fenced"; error: string }
  | { status: "error"; effects: CommandEffects; error: string; detail: string };

/**
 * How long a claim is believed without a word from its owner.
 *
 * Ninety seconds is not a guess about how long commands take — the heartbeat
 * removes that question. It is how long an operator waits for a button to work
 * again after the tab holding it died, and a minute and a half is about the
 * limit of what somebody standing at a till will tolerate.
 */
export const COMMAND_LEASE_SECONDS = 90;

/**
 * A third of the lease. Two heartbeats can be lost to a slow round trip before
 * anybody's claim is at risk, which is the margin a single-heartbeat-per-lease
 * schedule does not have.
 */
export const COMMAND_HEARTBEAT_MS = 30_000;

/**
 * A refusal that says what it left behind.
 *
 * The point of the class is the `effects` field, and the point of the field is
 * that the runner cannot infer it. Only the handler knows whether it got as
 * far as writing something, and a runner that guesses will guess "nothing"
 * because that is the comfortable answer.
 */
export class CommandFailure extends Error {
  readonly effects: CommandEffects;
  /** The half sentence that goes inside the "Partly applied" copy. */
  readonly detail: string;

  constructor(effects: CommandEffects, detail: string, options?: { cause?: unknown }) {
    super(detail, options);
    this.name = "CommandFailure";
    this.effects = effects;
    this.detail = detail;
  }
}

/**
 * The claim never landed, so the handler never ran.
 *
 * THIS AND THE 'none' ARM BELOW ARE THE ONLY TWO PLACES IN THIS FILE ALLOWED
 * TO SAY "Nothing was changed", and `copy.static.test.ts` asserts it. Both are
 * effects 'none' — here structurally, because there is no claim for a handler
 * to have run under.
 */
const COULD_NOT_START = "Could not start that. Nothing was changed.";

/**
 * Taken over while our handler was still running.
 *
 * Deliberately does not say whether the work happened. It may have happened
 * twice: our handler ran to completion and the runner that replaced us is very
 * likely running the same one.
 */
const FENCED = "Another attempt took this over while it was running. Check before retrying.";

/** Trim the detail into something that reads inside a sentence. */
function detailPhrase(detail: string): string {
  const trimmed = detail.trim().replace(/[.\s]+$/, "");
  return trimmed.length > 0 ? trimmed.slice(0, 160) : "part of it landed";
}

/**
 * One sentence per thing we actually know.
 *
 * `unknown` is the default for a plain throw and it is the uncomfortable one:
 * it tells an operator to go and look, which is more work than "that failed"
 * and is the only honest answer when a handler died between two writes.
 */
export function failureMessage(effects: CommandEffects, detail: string): string {
  switch (effects) {
    case "none":
      return "That did not go through. Nothing was changed.";
    case "partial":
      return `Partly applied: ${detailPhrase(detail)}. Do not retry blindly.`;
    case "unknown":
      return "It may have gone through. Check before retrying.";
  }
}

type ClaimResponse =
  | { outcome: "claimed"; claimId: string; ownerToken: string }
  | { outcome: "replayed"; result: unknown; revision: number | null }
  | { outcome: "in_flight"; leaseExpiresAt: string | null }
  | { outcome: "conflict" }
  /** The transport failed, or the function refused. Either way: no claim. */
  | { outcome: "unavailable" };

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
  handler: CommandHandler<T>,
): Promise<CommandOutcome<T>> {
  const fingerprint = await fingerprintRequest(envelope, args);
  const claim = await claimCommand(admin, envelope, fingerprint);

  switch (claim.outcome) {
    case "conflict":
      return { status: "conflict", reason: "fingerprint_mismatch" };
    case "in_flight":
      return { status: "in_flight", leaseExpiresAt: claim.leaseExpiresAt };
    case "replayed":
      return { status: "replayed", result: claim.result as T, revision: claim.revision };
    case "unavailable":
      // NO SECOND ATTEMPT. A transport failure on the claim is indistinguishable
      // from a claim that landed and lost its reply, and retrying it is how one
      // intent becomes two rows in a table whose entire job is to stop that.
      return { status: "error", effects: "none", error: COULD_NOT_START, detail: COULD_NOT_START };
    case "claimed":
      return execute(admin, envelope, claim.claimId, claim.ownerToken, handler);
  }
}

async function claimCommand(
  admin: Admin,
  envelope: CommandEnvelope,
  fingerprint: string,
): Promise<ClaimResponse> {
  const response = await admin.rpc("command_claim", {
    p_tenant_id: envelope.tenantId,
    p_command: envelope.command,
    p_idempotency_key: envelope.idempotencyKey,
    p_fingerprint: fingerprint,
    p_actor_user_id: envelope.actorUserId,
    p_correlation_id: envelope.correlationId,
    p_expected_revision: envelope.expectedRevision,
    p_lease_seconds: COMMAND_LEASE_SECONDS,
  });

  if (response.error) {
    logServerError("commands/runCommand.claim", response.error);
    return { outcome: "unavailable" };
  }

  const payload = asRecord(response.data);
  const outcome = typeof payload.outcome === "string" ? payload.outcome : "";

  if (outcome === "conflict") return { outcome: "conflict" };

  if (outcome === "in_flight") {
    return { outcome: "in_flight", leaseExpiresAt: asIsoOrNull(payload.lease_expires_at) };
  }

  if (outcome === "replayed") {
    return {
      outcome: "replayed",
      result: payload.result ?? null,
      revision: asIntOrNull(payload.revision),
    };
  }

  if (outcome === "claimed") {
    const claimId = typeof payload.claim_id === "string" ? payload.claim_id : null;
    const ownerToken = typeof payload.owner_token === "string" ? payload.owner_token : null;
    // A claim we cannot address is not a claim. Running the handler on the
    // strength of the word "claimed" alone would run it with no way to stamp,
    // release or fence it.
    if (!claimId || !ownerToken) {
      logServerError("commands/runCommand.claim", new Error("claimed without an addressable token"));
      return { outcome: "unavailable" };
    }
    return { outcome: "claimed", claimId, ownerToken };
  }

  // 'refused' with bad_input, vanished or unavailable, or a shape this code
  // does not know. None of them is a claim, and none of them ran a handler.
  logServerError(
    "commands/runCommand.claim",
    new Error(`command_claim refused: ${String(payload.reason ?? outcome ?? "unrecognised")}`),
  );
  return { outcome: "unavailable" };
}

async function execute<T>(
  admin: Admin,
  envelope: CommandEnvelope,
  claimId: string,
  ownerToken: string,
  handler: CommandHandler<T>,
): Promise<CommandOutcome<T>> {
  const heartbeat = () => sendHeartbeat(admin, claimId, ownerToken);
  // The runner keeps the lease alive so a handler does not have to remember
  // to. `context.heartbeat` exists for handlers that want to KNOW they were
  // fenced, which this timer cannot tell them.
  const timer = setInterval(() => {
    void heartbeat();
  }, COMMAND_HEARTBEAT_MS);

  let result: T;
  try {
    result = await handler(envelope, { claimId, ownerToken, heartbeat });
  } catch (error) {
    clearInterval(timer);
    const effects: CommandEffects = error instanceof CommandFailure ? error.effects : "unknown";
    const detail = error instanceof CommandFailure ? error.detail : messageOf(error);
    logServerError(`commands/${envelope.command}`, error);
    const stamp = await settle(admin, claimId, ownerToken, {
      p_status: "failed",
      p_effects: effects,
      p_error_message: detail,
    });
    if (stamp === "fenced") return { status: "fenced", error: FENCED };
    return { status: "error", effects, error: failureMessage(effects, detail), detail };
  }
  clearInterval(timer);

  const stamp = await settle(admin, claimId, ownerToken, {
    p_status: "succeeded",
    // `?? null` rather than the raw value: a handler returning `undefined`
    // would write SQL NULL either way, but going through it explicitly means a
    // replay hands back `null` and not `undefined`, so the replayed and
    // first-run shapes agree.
    p_result: result ?? null,
    p_result_revision: revisionOf(result),
    p_effects: "done",
  });

  // A FENCED SUCCESS IS NOT A SUCCESS TO REPORT. Our handler finished, but the
  // runner that took the claim from us is very likely running the same handler
  // right now, and the recorded result will be theirs. Returning `ok` here
  // would tell the caller a single thing happened when two may have.
  if (stamp === "fenced") return { status: "fenced", error: FENCED };
  return { status: "ok", result };
}

/**
 * Stamp the claim. Three answers, and the caller cares about all three.
 *
 * 'unavailable' is NOT retried and NOT reported as a failure of the work. The
 * work is done; what was lost is the bookkeeping. The claim's lease runs out
 * and the row surfaces in the Exceptions inbox as an abandoned claim, which is
 * a truthful description of it.
 */
async function settle(
  admin: Admin,
  claimId: string,
  ownerToken: string,
  patch: Record<string, unknown>,
): Promise<"ok" | "fenced" | "unavailable"> {
  const response = await admin.rpc("command_complete", {
    p_claim_id: claimId,
    p_owner_token: ownerToken,
    p_result: null,
    p_result_revision: null,
    p_error_message: null,
    ...patch,
  });

  if (response.error) {
    logServerError("commands/runCommand.stamp", response.error);
    return "unavailable";
  }

  const payload = asRecord(response.data);
  if (payload.ok === true) return "ok";
  if (payload.reason === "fenced") return "fenced";

  logServerError(
    "commands/runCommand.stamp",
    new Error(`command_complete refused: ${String(payload.reason ?? "unrecognised")}`),
  );
  return "unavailable";
}

async function sendHeartbeat(
  admin: Admin,
  claimId: string,
  ownerToken: string,
): Promise<boolean> {
  const response = await admin.rpc("command_heartbeat", {
    p_claim_id: claimId,
    p_owner_token: ownerToken,
    p_lease_seconds: COMMAND_LEASE_SECONDS,
  });
  if (response.error) {
    // A missed heartbeat is not a fence. Reporting false here would tell a
    // handler it had lost a claim it still holds, and the lease has room for
    // two of these before it matters.
    logServerError("commands/runCommand.heartbeat", response.error);
    return false;
  }
  return asRecord(response.data).ok === true;
}

/**
 * A result that carries a numeric `revision` records it alongside itself.
 *
 * Opt-in by shape rather than by a second handler argument: most commands do
 * not touch a versioned aggregate, and making every one of them return a
 * revision it does not have would produce a column full of invented zeroes.
 */
function revisionOf(result: unknown): number | null {
  if (result === null || typeof result !== "object") return null;
  const revision = (result as { revision?: unknown }).revision;
  return typeof revision === "number" && Number.isInteger(revision) ? revision : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asIsoOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asIntOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}
