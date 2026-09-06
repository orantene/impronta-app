/**
 * balance-reconcile.ts — does what Stripe says we hold match what we recorded?
 *
 * THE POINT. Everything else in the finance stack checks that individual
 * operations behaved: this webhook fired, that snapshot balanced, this refund
 * was accepted. None of it asks the only question an auditor asks — do OUR
 * records and the PROVIDER's records agree on the total?
 *
 * They can diverge without any single operation failing. A missed webhook, an
 * ingest window that silently truncated, an event delivered while a deploy was
 * mid-flight: each leaves every local check green and the totals apart.
 *
 * INVARIANT. Stripe's balance is, by construction, the sum of every balance
 * transaction on the account. So if we have ingested them all, then for each
 * currency:
 *
 *     sum(provider_balance_transactions.net_cents) == available + pending
 *
 * THE HONEST CAVEAT, which the alert carries rather than hides: that holds only
 * if ingestion covered the account's ENTIRE history. If ingestion began after
 * the first charge, our sum is legitimately short by everything before it, and
 * the delta is an artifact rather than a fault. So a non-zero delta is reported
 * WITH the earliest ingested transaction date, letting a human tell "we missed
 * something" from "we started counting late". Claiming a strict invariant we
 * cannot guarantee would produce an alarm nobody can action, which is how
 * alarms get muted.
 *
 * Today the platform has processed zero transactions, so both sides are zero
 * and the check is trivially true. That is exactly when to install it: the
 * first real divergence should page someone, not be discovered at year end.
 */

import "server-only";

/** One currency's worth of Stripe balance, summed across its funding sources. */
export type StripeBalanceByCurrency = Record<string, number>;

export type BalanceDelta = {
  currency: string;
  /** available + pending, per Stripe. */
  stripeCents: number;
  /** sum(net_cents) of everything we ingested. */
  oursCents: number;
  /** stripe - ours. Positive = Stripe holds more than we recorded, i.e. we are
   *  MISSING transactions, which is the common direction for a missed webhook
   *  or a truncated ingest window. */
  deltaCents: number;
};

/**
 * Sum Stripe's balance arrays into a per-currency total.
 *
 * `available` and `pending` are separate arrays of `{amount, currency}`, and a
 * multi-currency account has an entry per currency in each. Summing both is
 * correct here: a pending transaction has a balance transaction recorded
 * against it, so it is already inside our sum too. Counting only `available`
 * would produce a permanent phantom delta the size of whatever is in flight.
 */
export function sumStripeBalance(balance: {
  available?: Array<{ amount?: number | null; currency?: string | null }> | null;
  pending?: Array<{ amount?: number | null; currency?: string | null }> | null;
}): StripeBalanceByCurrency {
  const out: StripeBalanceByCurrency = {};
  for (const bucket of [balance.available ?? [], balance.pending ?? []]) {
    for (const entry of bucket) {
      const currency = (entry.currency ?? "").toLowerCase();
      if (!currency) continue;
      out[currency] = (out[currency] ?? 0) + (entry.amount ?? 0);
    }
  }
  return out;
}

/**
 * Pure: compare the two sides and return one row per currency present in
 * EITHER. No I/O, so the arithmetic is testable without Stripe or a database.
 *
 * Union rather than intersection deliberately. A currency Stripe knows about
 * and we have never recorded is precisely the interesting case — an
 * intersection would silently drop it and report agreement.
 */
export function computeBalanceDeltas(
  stripe: StripeBalanceByCurrency,
  ours: StripeBalanceByCurrency,
): BalanceDelta[] {
  const currencies = new Set([...Object.keys(stripe), ...Object.keys(ours)]);
  return [...currencies].sort().map((currency) => {
    const stripeCents = stripe[currency] ?? 0;
    const oursCents = ours[currency] ?? 0;
    return { currency, stripeCents, oursCents, deltaCents: stripeCents - oursCents };
  });
}

/** Only the currencies that actually disagree. */
export function mismatchedDeltas(deltas: BalanceDelta[]): BalanceDelta[] {
  return deltas.filter((d) => d.deltaCents !== 0);
}

/**
 * A one-line, actionable summary. The earliest ingested date is included
 * because it is the single fact that distinguishes a real gap from a late
 * ingestion start, and an operator should not have to go and find it.
 */
export function describeMismatch(
  deltas: BalanceDelta[],
  earliestIngestedAt: string | null,
): string {
  const parts = deltas.map(
    (d) =>
      `${d.currency.toUpperCase()}: Stripe ${(d.stripeCents / 100).toFixed(2)} vs ours ${(
        d.oursCents / 100
      ).toFixed(2)} (delta ${(d.deltaCents / 100).toFixed(2)})`,
  );
  const since = earliestIngestedAt
    ? `Earliest ingested balance transaction: ${earliestIngestedAt}. A delta is expected if the account had activity before that date.`
    : "We have ingested NO balance transactions, so any non-zero Stripe balance is entirely unrecorded.";
  return `${parts.join("; ")}. ${since}`;
}
