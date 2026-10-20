/**
 * checkout-session-reopen.ts (TUL-1280 money review P1): never hand back a
 * dead Checkout URL.
 *
 * Pro (key A, session A) -> Portfolio (the trial sweep expires A) -> Pro again:
 * key A makes Stripe REPLAY its cached response for session A, which is now
 * expired, so the buyer would get a dead URL for up to 24h. After create we
 * check the session (known-swept in this request, or retrieved status) and, if
 * it is not open, create again under a key derived from the expired id. Each
 * hop is deterministic, so a double click still collapses; a later cycle simply
 * takes one more hop. Params are sent unchanged (amounts, coupons, metadata).
 */

export const REOPEN_MAX_HOPS = 5;

/** The deterministic re-key: the base key plus the last 8 chars of the dead session id. */
export function reopenKey(idempotencyKey: string, expiredSessionId: string): string {
  return `${idempotencyKey}:r:${expiredSessionId.slice(-8)}`;
}

type ReopenStripe<P, S> = {
  checkout: {
    sessions: {
      create: (params: P, options: { idempotencyKey: string }) => Promise<S>;
      retrieve: (id: string) => Promise<{ status?: string | null }>;
    };
  };
};

/** The first OPEN session for these params; throws after REOPEN_MAX_HOPS dead hops. */
export async function reopenIfExpired<P, S extends { id: string }>(
  stripe: ReopenStripe<P, S>,
  created: S,
  params: P,
  idempotencyKey: string,
  sweptIds: ReadonlySet<string>,
): Promise<S> {
  let current = created;
  for (let hop = 0; ; hop += 1) {
    const dead = sweptIds.has(current.id) || (await stripe.checkout.sessions.retrieve(current.id)).status !== "open";
    if (!dead) return current;
    if (hop >= REOPEN_MAX_HOPS) throw new Error(`checkout reopen: still expired after ${REOPEN_MAX_HOPS} hops`);
    current = await stripe.checkout.sessions.create(params, { idempotencyKey: reopenKey(idempotencyKey, current.id) });
  }
}
