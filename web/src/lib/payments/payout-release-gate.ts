import "server-only";

/**
 * The payout release gate: the two pure rules with real money behind them.
 *
 * `booking_payouts.status` says whether the PAYEE can receive. `release_after`
 * says whether the money is DUE. The two are ORTHOGONAL -- a leg can be blocked
 * by both at once -- which is why the gate is a timestamp beside the status and
 * not another status value: a status field can only say one thing, so a
 * `scheduled` state would have to lie about whichever condition it was not
 * naming.
 *
 * Without the gate, a ticket payout marked `held` releases on the next
 * `account.updated` flip or reconcile cron run -- BEFORE THE SHOW -- silently,
 * and the only signal is that it worked.
 *
 * Kept pure and in their own file so both rules are testable without a
 * database, and so the ledger module stays under its line cap without the
 * reasoning being deleted to fit.
 */

/**
 * The later of two holds, treating `null` as "due now" (i.e. no hold).
 *
 * Pure, and exported so the rule is testable without a database. The rule it
 * encodes: a hold may be EXTENDED, never shortened or removed by routine
 * bookkeeping. `null` can therefore never win over a real timestamp -- an
 * upsert that omits the gate must not release the money.
 */
export function laterHold(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

/** True when a leg is due: no gate, or the gate has passed. */
export function isDue(releaseAfter: string | null, now: Date = new Date()): boolean {
  if (!releaseAfter) return true;
  return new Date(releaseAfter).getTime() <= now.getTime();
}
