/**
 * Retrying a payout leg's Stripe transfer without ever paying it twice.
 *
 * Why: the leg's idempotency key was fixed (`transfer_<booking>_<participant>_<party>`), and Stripe stores
 * the RESULT under a key for 24 hours, including a refusal. So one transient 'insufficient available funds'
 * stranded the leg: every retry replayed the same error (paid run 2026-10-09).
 *
 * Rules (PM-approved):
 *  - After a DETERMINISTIC refusal (a 4xx that is not a rate limit: insufficient funds, account not payable ...)
 *    the next attempt uses a NEW key `<base>_a<N>`. N lives on the leg as a `[key_a:N]` note in last_error.
 *  - After an AMBIGUOUS failure (timeout, network, 5xx, 429) the SAME key is reused, so a transfer that did
 *    succeed is replayed, not repeated.
 *  - Before any new-key attempt, the transfers for that booking are listed; if one already exists for this leg
 *    no new transfer is made, and if the list cannot be read the attempt is skipped (never a blind retry).
 *  - A transfer that was REVERSED (fully or partly, a refund clawback) still counts as existing: the leg is
 *    never paid again automatically. It is flagged `needs_attention:transfer_reversed` for a person to decide.
 *  - Every transfer path wrote `transfer_group = booking_<id>` and metadata booking_id / participant_id / party since
 *    the first implementation (Money P3, 2026-05-29), so no legacy fallback match is needed.
 */
import type Stripe from "stripe";


const KEY_NOTE = /\[key_a:(\d+)\]/;

/** Stamped on a leg whose Stripe transfer was (even partly) reversed: it is never paid again automatically. */
export const REVERSED_NOTE = "needs_attention:transfer_reversed";

/** The key attempt a leg is on, from its last_error note (0 when it has none). */
export function keyAttemptOf(lastError: string | null | undefined): number {
  const m = KEY_NOTE.exec(lastError ?? "");
  return m ? Math.max(0, Number(m[1])) : 0;
}

export function keyForAttempt(baseKey: string, attempt: number): string {
  return attempt > 0 ? `${baseKey}_a${attempt}` : baseKey;
}

/** A refusal Stripe will answer the same way every time: only a NEW key can try again. */
export function isDeterministicTransferError(err: unknown): boolean {
  const status = (err as { statusCode?: number } | null)?.statusCode;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 429;
}

/** The note stored with a failed attempt: the message plus the key attempt the NEXT try must use. */
export function failureNote(message: string, attempt: number, deterministic: boolean): string {
  const next = deterministic ? attempt + 1 : attempt;
  return `${message.replace(KEY_NOTE, "").trim()} [key_a:${next}]`;
}

export type LegTransferResult =
  | { kind: "transferred"; transferId: string }
  | { kind: "existing"; transferId: string }
  | { kind: "unverified" } // the list could not be read, or the leg was flagged reversed: not retried
  | { kind: "failed"; message: string; note: string };

export type ExistingLegTransfer =
  | { kind: "none" }
  | { kind: "existing"; transferId: string }
  | { kind: "reversed"; transferId: string }
  | { kind: "unreadable" };

/**
 * Is there already a Stripe transfer for this leg? Matched by the booking's transfer_group (`booking_<id>`)
 * plus metadata participant_id / party, which every transfer path has written since Money P3. A transfer Stripe
 * made but our ledger never recorded (a crash between the two) is found here, whatever amount it was made for and
 * whether or not Stripe's 24h idempotency window has lapsed (TUL-1746). A reversed one (fully or partly) still
 * counts as existing; an unreadable list is "unreadable", never "none". A client without `transfers.list` (a test
 * double) reads as none: the real Stripe client always has it.
 */
export async function findExistingLegTransfer(
  stripe: Pick<Stripe, "transfers">,
  ref: { bookingId: string; participantId: string; party: string },
): Promise<ExistingLegTransfer> {
  if (typeof stripe.transfers.list !== "function") return { kind: "none" };
  try {
    const listed = await stripe.transfers.list({ transfer_group: `booking_${ref.bookingId}`, limit: 100 });
    const found = listed.data.find((t) => t.metadata?.participant_id === ref.participantId && t.metadata?.party === ref.party);
    if (!found) return { kind: "none" };
    return found.reversed || (found.amount_reversed ?? 0) > 0
      ? { kind: "reversed", transferId: found.id }
      : { kind: "existing", transferId: found.id };
  } catch {
    return { kind: "unreadable" };
  }
}

export async function attemptLegTransfer(
  stripe: Pick<Stripe, "transfers">,
  leg: {
    bookingId: string;
    participantId: string;
    party: string;
    /** The leg's stable base key (`payoutIdempotencyKey`); passed in so this module stays free of the ledger. */
    baseKey: string;
    amountCents: number;
    currency: string;
    destination: string;
    lastError: string | null | undefined;
    metadata?: Record<string, string>;
  },
): Promise<LegTransferResult> {
  // Flagged earlier: a person decides, not the cron.
  if ((leg.lastError ?? "").includes(REVERSED_NOTE)) return { kind: "unverified" };
  const attempt = keyAttemptOf(leg.lastError);
  // Look BEFORE every create, not only after a refusal (TUL-1746): the first attempt can also follow a transfer
  // Stripe made and our ledger lost, and a changed amount or a lapsed key window would otherwise pay it twice.
  const existing = await findExistingLegTransfer(stripe, leg);
  if (existing.kind === "reversed") {
    const message = `a transfer for this leg (${existing.transferId}) was reversed on Stripe; not paid again`;
    return { kind: "failed", message, note: `${message} [${REVERSED_NOTE}]` };
  }
  if (existing.kind === "existing") return { kind: "existing", transferId: existing.transferId };
  if (existing.kind === "unreadable") return { kind: "unverified" };
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: leg.amountCents,
        currency: leg.currency,
        destination: leg.destination,
        transfer_group: `booking_${leg.bookingId}`,
        metadata: { booking_id: leg.bookingId, participant_id: leg.participantId, party: leg.party, ...(leg.metadata ?? {}) },
      },
      { idempotencyKey: keyForAttempt(leg.baseKey, attempt) },
    );
    return { kind: "transferred", transferId: transfer.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "transfer failed";
    return { kind: "failed", message, note: failureNote(message, attempt, isDeterministicTransferError(err)) };
  }
}
