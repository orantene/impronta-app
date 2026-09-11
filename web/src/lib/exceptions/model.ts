/**
 * model.ts — what an exception IS, before anything reads a table.
 *
 * WHY A MODEL AND NOT FIVE LISTS. The five sources this inbox draws from
 * (`ticket_refund_intents`, `admissions_mint_shortfall`, `failed_engine_effects`,
 * stalled POS collections, dead `outbox_messages`) are each individually
 * inspectable today by someone who knows the table name and has SQL. That is
 * developer logging, not a product. An operator's question is never "show me
 * failed_engine_effects" — it is "what is broken, how bad is it, whose problem
 * is it, and what do I press". Answering that requires one shape across all
 * five, which is what this file is.
 *
 * THE HARD PART IS SEVERITY, AND IT IS NOT A COLUMN. `failed_engine_effects`
 * has a `priority` and it means something different from a stuck refund. The
 * ranking here encodes a single question — CAN THIS STILL HURT SOMEONE — and
 * the answers come out in an order nobody would have got from the tables:
 *
 *   critical  a customer is already harmed, or money moved and we cannot say
 *             where it went. A mint shortfall is critical because a buyer is
 *             standing at a door holding a receipt for a ticket that does not
 *             exist. A claimed-but-unexecuted refund is critical because the
 *             one thing we know is that we do not know.
 *   high      the automation gave up, or is visibly not running. Nothing is
 *             wrong yet; it will be.
 *   normal    a machine is retrying and the retries are still plausible.
 *
 * `normal` is deliberately not called `low`. Everything here is a real defect
 * in a real workspace; a bucket named "low" is a bucket nobody opens.
 *
 * THE NEXT ACTION IS TYPED, AND THE TYPE IS THE SAFETY. Half of these can be
 * re-driven by pressing a button, because the executor behind them is
 * idempotent — minting checks what exists, the engine retry is keyed on
 * (event, listener), the outbox dedupes. The other half MUST NOT have a button,
 * because pressing it a second time could move money twice. Expressing that as
 * `resume` versus `inspect` rather than as a disabled prop is what stops the
 * next screen from getting it wrong: an `inspect` row has nothing to press,
 * anywhere, by construction.
 *
 * PURE. No `server-only`, no client, no Supabase. The ordering and the
 * severity rules are the part that has to be right, and they are the part a
 * database makes impossible to test.
 */

export const EXCEPTION_SOURCES = [
  /** A paid ticket line whose refund has not landed. */
  "refund_intent",
  /** A paid, session-backed line that minted fewer admissions than it sold. */
  "mint_shortfall",
  /** An inquiry-engine listener that failed and is being retried. */
  "engine_effect",
  /** A POS card collection that was started and never resolved either way. */
  "unresolved_collection",
  /** A durable side effect that exhausted its retries. */
  "outbox_dead",
  /** A command that took an idempotency claim and never came back for it. */
  "stale_command_claim",
] as const;

export type ExceptionSource = (typeof EXCEPTION_SOURCES)[number];

export type ExceptionSeverity = "critical" | "high" | "normal";

/**
 * Which desk owns it. NOT which table it came from — an operator on the floor
 * cannot act on "outbox", and routing by source would put a stuck refund and a
 * stuck receipt email in front of the same person for no reason.
 */
export const EXCEPTION_OWNERS = ["money", "door", "coordination", "operations"] as const;
export type ExceptionOwner = (typeof EXCEPTION_OWNERS)[number];

/**
 * The verbs a row can be re-driven with. Closed, because each one names an
 * executor that is already idempotent, and adding a verb whose executor is not
 * would make the button a duplicate-effect machine.
 */
export const RESUME_VERBS = [
  "run_refund_intent",
  "mint_missing_admissions",
  "retry_engine_effect",
  "requeue_outbox_message",
  "recover_unresolved_collection",
] as const;
export type ResumeVerb = (typeof RESUME_VERBS)[number];

export type NextAction =
  /** Safe to press, and safe to press twice. */
  | { kind: "resume"; verb: ResumeVerb; label: string }
  /**
   * A person has to look. There is no button — not a disabled one, none — so a
   * later screen cannot accidentally make one appear.
   */
  | { kind: "inspect"; label: string; why: string };

export type ExceptionRow = {
  /** Stable across polls, so a list can re-render without losing selection. */
  key: string;
  source: ExceptionSource;
  severity: ExceptionSeverity;
  owner: ExceptionOwner;
  /** The row's own id in its source table, for the resume action. */
  sourceId: string;
  title: string;
  detail: string;
  attempts: number;
  firstSeenAt: string;
  lastAttemptAt: string | null;
  nextAction: NextAction;
  /** Where the underlying object lives, when there is one. */
  href: string | null;
};

const SEVERITY_RANK: Record<ExceptionSeverity, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

/**
 * Severity first, then OLDEST first inside a severity.
 *
 * Newest-first is the wrong default for a work queue and the mistake is easy
 * to make: it puts the thing least likely to have hurt anybody at the top and
 * buries the one that has been broken since Tuesday. A queue is sorted by how
 * long someone has been waiting.
 */
export function sortExceptions(rows: readonly ExceptionRow[]): ExceptionRow[] {
  return [...rows].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const at = Date.parse(a.firstSeenAt);
    const bt = Date.parse(b.firstSeenAt);
    // An unparseable timestamp sorts last rather than to 1970: a corrupt date
    // must not win the top of a queue it has no claim to.
    if (!Number.isFinite(at)) return Number.isFinite(bt) ? 1 : 0;
    if (!Number.isFinite(bt)) return -1;
    return at - bt;
  });
}

export type ExceptionSummary = {
  total: number;
  bySeverity: Record<ExceptionSeverity, number>;
  byOwner: Record<ExceptionOwner, number>;
  /** How many can be re-driven from the screen without a person deciding. */
  resumable: number;
};

export function summariseExceptions(rows: readonly ExceptionRow[]): ExceptionSummary {
  const summary: ExceptionSummary = {
    total: rows.length,
    bySeverity: { critical: 0, high: 0, normal: 0 },
    byOwner: { money: 0, door: 0, coordination: 0, operations: 0 },
    resumable: 0,
  };
  for (const row of rows) {
    summary.bySeverity[row.severity] += 1;
    summary.byOwner[row.owner] += 1;
    if (row.nextAction.kind === "resume") summary.resumable += 1;
  }
  return summary;
}

/**
 * How long the refund cron is allowed to leave an intent alone before its
 * silence is itself the exception.
 *
 * The cron runs every minute. Fifteen of them is not "slow" — it is "the cron
 * is not running", and the whole reason the intent table exists is that nobody
 * finds that out until a customer asks where their money is.
 */
export const REFUND_INTENT_STALE_MS = 15 * 60_000;

/**
 * How long a started card collection may sit unresolved before it is an
 * exception rather than a customer reading their PIN.
 *
 * Twenty minutes is past every legitimate terminal interaction and short
 * enough that the till still remembers the sale.
 */
export const COLLECTION_STALE_MS = 20 * 60_000;

/** After this many engine retries, the retry is not the story any more. */
export const ENGINE_EFFECT_GIVING_UP_ATTEMPTS = 5;

export type RefundIntentFacts = {
  id: string;
  orderId: string;
  reason: string;
  createdAt: string;
  claimedAt: string | null;
  executedAt: string | null;
  result: string | null;
  attempts: number;
};

/**
 * A refund intent's three shapes, and only one of them has a button.
 *
 * CLAIMED-BUT-NOT-EXECUTED IS THE DANGEROUS ONE. The executor claims before it
 * calls Stripe, precisely so that a crash mid-refund cannot be redone; the
 * price of that guarantee is a state where the money may or may not have moved
 * and nothing in our database can say which. Offering "run it again" there
 * would hand an operator a second refund one click away, which is the exact
 * outcome `claimed_at` exists to prevent.
 *
 * `partial_failure` is the same class of problem arriving by a different road:
 * the executor's own word for "money moved and something after it did not".
 */
export function classifyRefundIntent(
  facts: RefundIntentFacts,
  now: number,
  href: string | null,
): ExceptionRow | null {
  const age = now - Date.parse(facts.createdAt);
  const claimed = facts.claimedAt !== null;
  const executed = facts.executedAt !== null;

  if (executed && facts.result !== "partial_failure") return null;

  const base = {
    key: `refund_intent:${facts.id}`,
    source: "refund_intent" as const,
    owner: "money" as const,
    sourceId: facts.id,
    attempts: facts.attempts,
    firstSeenAt: facts.createdAt,
    lastAttemptAt: facts.claimedAt,
    href,
  };

  if (executed) {
    return {
      ...base,
      severity: "critical",
      title: "Refund partly failed",
      detail:
        "The refund executor moved money and something after it did not complete. " +
        "Check the payment provider before doing anything else.",
      nextAction: {
        kind: "inspect",
        label: "Open the order",
        why: "Money moved. Re-running could refund the customer twice.",
      },
    };
  }

  if (claimed) {
    return {
      ...base,
      severity: "critical",
      title: "Refund claimed but never finished",
      detail:
        "The executor took this refund and never recorded an outcome. " +
        "The refund may or may not have reached the provider.",
      nextAction: {
        kind: "inspect",
        label: "Open the order",
        why: "We cannot tell whether the money already moved.",
      },
    };
  }

  return {
    ...base,
    severity: Number.isFinite(age) && age > REFUND_INTENT_STALE_MS ? "high" : "normal",
    title: "Refund owed and not sent",
    detail:
      facts.reason === "event_cancelled"
        ? "The event was cancelled and this buyer has not been refunded yet."
        : "This buyer lost their seat after paying and has not been refunded yet.",
    nextAction: {
      kind: "resume",
      verb: "run_refund_intent",
      // NOT "refund now". The executor lives in the cron and claims before it
      // calls the provider; a button that refunded inline would give one
      // intent two executors racing over the same row, which is the failure
      // `claimed_at` exists to prevent. This arms the row instead, and the
      // label says so rather than promising an instant the code cannot give.
      label: "Send it back to the refund queue",
    },
  };
}

export type MintShortfallFacts = {
  orderLineId: string;
  orderId: string;
  expectedRows: number;
  mintedRows: number;
  missingRows: number;
  orderUpdatedAt: string;
};

/**
 * Always critical, with no age threshold.
 *
 * There is no window in which selling a ticket and not issuing it is a small
 * problem. The buyer has a receipt; the door has nothing; the only question is
 * whether we find out before they do.
 */
export function classifyMintShortfall(
  facts: MintShortfallFacts,
  href: string | null,
): ExceptionRow {
  return {
    key: `mint_shortfall:${facts.orderLineId}`,
    source: "mint_shortfall",
    severity: "critical",
    owner: "door",
    sourceId: facts.orderLineId,
    title: `${facts.missingRows} ticket${facts.missingRows === 1 ? "" : "s"} sold and never issued`,
    detail: `Paid for ${facts.expectedRows}, issued ${facts.mintedRows}. The buyer has a receipt and no ticket.`,
    attempts: 0,
    firstSeenAt: facts.orderUpdatedAt,
    lastAttemptAt: null,
    nextAction: {
      kind: "resume",
      verb: "mint_missing_admissions",
      label: "Issue the missing tickets",
    },
    href,
  };
}

export type EngineEffectFacts = {
  id: string;
  inquiryId: string;
  listenerName: string;
  engineAction: string;
  priority: string;
  attemptCount: number;
  createdAt: string;
  retriedAt: string | null;
};

/**
 * The stored `priority` is an input, not the answer.
 *
 * A `low` effect that has failed six times is a worse problem than a `high`
 * one on its first attempt: the first has stopped being retried and nobody
 * has been told, the second is the machine working. Attempts therefore
 * override priority in one direction only — upward.
 */
export function classifyEngineEffect(
  facts: EngineEffectFacts,
  href: string | null,
): ExceptionRow {
  const givingUp = facts.attemptCount >= ENGINE_EFFECT_GIVING_UP_ATTEMPTS;
  const severity: ExceptionSeverity = givingUp
    ? "critical"
    : facts.priority === "high"
      ? "high"
      : "normal";

  return {
    key: `engine_effect:${facts.id}`,
    source: "engine_effect",
    severity,
    owner: "coordination",
    sourceId: facts.id,
    title: givingUp ? "Inquiry step has stopped retrying" : "Inquiry step failed",
    detail: `${facts.engineAction} → ${facts.listenerName}${
      givingUp ? ". Retries are exhausted; nothing will happen without a person." : ""
    }`,
    attempts: facts.attemptCount,
    firstSeenAt: facts.createdAt,
    lastAttemptAt: facts.retriedAt,
    nextAction: {
      kind: "resume",
      verb: "retry_engine_effect",
      label: givingUp ? "Grant it one more attempt" : "Retry this step now",
    },
    href,
  };
}

export type UnresolvedCollectionFacts = {
  transactionId: string;
  orderId: string | null;
  grossAmountCents: number;
  currency: string;
  requestedAt: string;
  /**
   * The provider's own id for the request this collection opened, when the
   * transaction recorded one. Null means nothing in the world can be asked
   * about this payment.
   */
  providerRequestId: string | null;
  /** How many times the recovery worker has already asked the provider. */
  recoveryAttempts?: number;
  /** The provider's last answer, in the engine's vocabulary. */
  lastRecoveryState?: string | null;
  lastRecoveryAt?: string | null;
  /**
   * When the worker spent this payment's budget and stopped asking.
   *
   * The row does NOT leave this inbox when that happens — the transaction is
   * still in `payment_requested` and the money is still unaccounted for. What
   * changes is who is expected to move next, and a row that says "asked 8
   * times, still no answer" while a machine silently keeps asking every five
   * minutes is the shape of a queue nobody trusts.
   */
  recoveryEscalatedAt?: string | null;
};

/**
 * WHAT CHANGED HERE, AND WHY THE OLD RULE WAS RIGHT UNTIL IT WASN'T.
 *
 * This row used to have no button at all, and the reason given was correctness
 * rather than caution: a collection in `payment_requested` means we asked for
 * money and never heard back, the provider is the authority on what happened,
 * and charging a customer twice is not symmetric with a person walking to the
 * terminal. Every word of that still holds.
 *
 * What was missing was the ability to ASK the provider. `stripeCollectionAdapter`
 * returned `unknown` from a stub, so no code in the system could find out what
 * happened, and "there is no button" was the only honest position available.
 * There is now a lookup and a worker that acts on its answer, and the button
 * arms that worker: it asks, it never charges, and it cannot open a payment
 * request because the create is not reachable from it. So the safety argument
 * now points the other way — a person who cannot press anything is a person who
 * either waits or reaches for the till, and the till is where a second charge
 * comes from.
 *
 * THE NO-BUTTON BRANCH SURVIVES, and it is the honest half of the split. A
 * transaction with no provider request id — opened before the stamp existed, or
 * opened in mock mode — has nothing to ask about, so there is no worker to arm
 * and it still needs a person. That row gets `inspect`, exactly as before.
 *
 * AND THERE IS A THIRD STATE NOW: the worker has asked as many times as its
 * budget allowed and stopped. The button stays, because asking is still the
 * only safe move and a person may know something the machine does not — a
 * terminal that has come back online, a provider incident that has ended. What
 * changes is the sentence: it says the machine has stopped, so pressing it is
 * understood as granting more rather than as nudging something already
 * running. This is the same shape as the engine-effect row's "Grant it one
 * more attempt", and for the same reason: a queue that gives up silently is
 * indistinguishable from a queue that is working.
 */
export function classifyUnresolvedCollection(
  facts: UnresolvedCollectionFacts,
  now: number,
  href: string | null,
): ExceptionRow | null {
  const age = now - Date.parse(facts.requestedAt);
  if (!Number.isFinite(age) || age < COLLECTION_STALE_MS) return null;
  const amount = `${(facts.grossAmountCents / 100).toFixed(2)} ${facts.currency.toUpperCase()}`;
  const askable = facts.providerRequestId !== null && facts.providerRequestId.length > 0;
  const attempts = facts.recoveryAttempts ?? 0;
  const lastState = facts.lastRecoveryState ?? null;
  const givenUp = askable && Boolean(facts.recoveryEscalatedAt);
  const asked = lastState
    ? `The provider was asked ${attempts} time${attempts === 1 ? "" : "s"} and last said: ${lastState}. `
    : "The provider has not been asked yet. ";
  return {
    key: `unresolved_collection:${facts.transactionId}`,
    source: "unresolved_collection",
    severity: "high",
    owner: "money",
    sourceId: facts.transactionId,
    title: givenUp ? "Card payment never came back, and asking has stopped" : "Card payment never came back",
    detail: givenUp
      ? `${amount} was requested and no result was recorded. `
        + asked
        + "Asking has stopped on its own after that many tries. Asking again is still safe. It never charges."
      : askable
        ? `${amount} was requested and no result was recorded. ` + asked + "Asking again is safe. It never charges."
        : `${amount} was requested from a reader and no result was recorded, and this payment carries `
          + "no provider reference, so it cannot be looked up. Check the terminal before re-charging.",
    attempts,
    firstSeenAt: facts.requestedAt,
    lastAttemptAt: facts.lastRecoveryAt ?? null,
    nextAction: askable
      ? {
          kind: "resume",
          verb: "recover_unresolved_collection",
          // NOT "collect again", and not "retry". The worker asks the provider
          // what already happened and finishes the job the answer describes;
          // saying anything that sounds like a new charge would be a lie about
          // the one thing an operator is frightened of here.
          //
          // The escalated label says who is being asked to move. The verb is
          // the same because the ACT is the same: a person cannot ask the
          // provider from here either way, and pretending the two buttons do
          // different things would be the lie.
          label: givenUp ? "Ask the provider once more" : "Ask the provider what happened",
        }
      : {
          kind: "inspect",
          label: "Open the sale",
          why: "This payment has no provider reference, so nobody can be asked.",
        },
    href,
  };
}

export type OutboxDeadFacts = {
  id: string;
  topic: string;
  attemptCount: number;
  createdAt: string;
  lastError: string | null;
};

/**
 * High, not critical, and the distinction is load-bearing.
 *
 * A dead outbox message is a side effect that did not happen — a receipt, a
 * dispatch, a notification. Real, and worth someone's morning. But the money
 * and the ticket legs of those flows are their OWN sources in this inbox, so a
 * dead message ranking `critical` would push a missing receipt above a missing
 * ticket, and an inbox whose top row is routinely not the worst thing is an
 * inbox people learn to scroll past.
 */
export function classifyOutboxDead(facts: OutboxDeadFacts): ExceptionRow {
  return {
    key: `outbox_dead:${facts.id}`,
    source: "outbox_dead",
    severity: "high",
    owner: "operations",
    sourceId: facts.id,
    title: `Gave up on ${facts.topic}`,
    detail: facts.lastError
      ? `Failed ${facts.attemptCount} times. Last error: ${facts.lastError}`
      : `Failed ${facts.attemptCount} times with no error recorded.`,
    attempts: facts.attemptCount,
    firstSeenAt: facts.createdAt,
    lastAttemptAt: null,
    nextAction: {
      kind: "resume",
      verb: "requeue_outbox_message",
      label: "Put it back in the queue",
    },
    href: null,
  };
}

export type StaleCommandClaimFacts = {
  id: string;
  /** Dotted command name, e.g. `exceptions.mint_missing_admissions`. */
  command: string;
  attempts: number;
  createdAt: string;
  /** When the lease ran out. Null on a row written before leases existed. */
  leaseExpiresAt: string | null;
};

/**
 * A claim whose owner stopped answering. Always critical, and never resumable.
 *
 * CRITICAL WITH NO AGE THRESHOLD, because the lease already IS the threshold.
 * A row only reaches this classifier after its owner has been silent for
 * longer than the lease, and the runner writes `effects = 'unknown'` for the
 * whole time a handler is in flight. So the one fact this row carries is that
 * a command stopped somewhere in the middle and nothing recorded where.
 *
 * NO BUTTON, AND THIS IS THE INTERESTING PART. Every other resumable source
 * here names ONE executor that is idempotent by construction. A command claim
 * names an arbitrary handler chosen by whoever wrote the command, and this
 * screen has no way to know whether that one is safe to run again. The retry
 * path that does know is the original caller pressing the original button: the
 * next identical request takes the expired lease over through `command_claim`.
 * Putting a generic "run it again" here would be a second executor for every
 * command in the system at once.
 */
export function classifyStaleCommandClaim(
  facts: StaleCommandClaimFacts,
  href: string | null,
): ExceptionRow {
  return {
    key: `stale_command_claim:${facts.id}`,
    source: "stale_command_claim",
    severity: "critical",
    owner: "operations",
    sourceId: facts.id,
    title: "A command stopped without recording what it did",
    detail:
      `${facts.command} took a claim and never came back. ` +
      "Its writes may have landed, may have half landed, or may never have started.",
    attempts: facts.attempts,
    firstSeenAt: facts.createdAt,
    lastAttemptAt: facts.leaseExpiresAt,
    nextAction: {
      kind: "inspect",
      label: "Check what the command touched",
      why: "Nobody can say whether the handler finished.",
    },
    href,
  };
}
