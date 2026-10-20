/**
 * trial-checkout-session.ts (TUL-1280, review P1): at most one live TRIAL
 * Checkout session per Stripe customer.
 *
 * Two sessions requested before either completes both see clean history, so
 * both could carry `trial_period_days` and a second trial could start. Before
 * creating a session that WILL carry a trial, we expire the customer's other
 * open trial sessions. A trial session is recognised by a marker in the
 * session-level metadata (never in subscription metadata) whose value is the
 * session's idempotency key: the session our own key would return on a
 * re-click is kept, because Stripe replays the cached session for that key.
 *
 * Best effort: a failed list or expire is logged and never blocks checkout.
 * Two creates in the same instant can each list before the other exists; the
 * post-create reconcile (trial-session-reconcile.ts) closes that race.
 */

export const TRIAL_SESSION_MARKER = "trial_checkout_key";

export type SessionStripe = {
  checkout: {
    sessions: {
      list: (params: { customer: string; status: "open"; limit: number }) => Promise<{
        data: { id: string; metadata?: Record<string, string> | null }[];
        has_more?: boolean;
      }>;
      expire: (id: string) => Promise<unknown>;
    };
  };
};

/**
 * Expires the customer's other open trial sessions and returns the marker to
 * ADD to this session's metadata ({} when this checkout carries no trial),
 * plus the ids it expired in THIS request and whether another trial session is
 * KNOWN still open (an expire failed), (checkout-session-reopen.ts uses them
 * to spot a replayed session that is already dead). Per Stripe customer: talent
 * and workspace customers are separate and never cross-swept.
 */
export async function sweepTrialSessions(
  stripe: SessionStripe | null,
  customerId: string,
  trialDays: number | null,
  idempotencyKey: string,
  onError: (where: string, err: unknown) => void,
): Promise<{ marker: Record<string, string>; expiredIds: Set<string>; otherTrialKnownOpen: boolean }> {
  const expiredIds = new Set<string>();
  if (trialDays == null || trialDays <= 0) return { marker: {}, expiredIds, otherTrialKnownOpen: false };
  const marker = { [TRIAL_SESSION_MARKER]: idempotencyKey };
  if (!stripe) return { marker, expiredIds, otherTrialKnownOpen: false };

  let open: { id: string; metadata?: Record<string, string> | null }[];
  try {
    open = (await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })).data;
  } catch (err) {
    onError("billing.trialSession.list", err);
    return { marker, expiredIds, otherTrialKnownOpen: false };
  }
  // An expire that failed leaves a trial session KNOWN open: the post-create reconcile fails closed on it.
  let otherTrialKnownOpen = false;
  for (const s of open) {
    const key = s.metadata?.[TRIAL_SESSION_MARKER];
    if (!key || key === idempotencyKey) continue;
    try {
      await stripe.checkout.sessions.expire(s.id);
      expiredIds.add(s.id);
    } catch (err) {
      otherTrialKnownOpen = true;
      onError("billing.trialSession.expire", err);
    }
  }
  return { marker, expiredIds, otherTrialKnownOpen };
}

/** The metadata marker only (see sweepTrialSessions). */
export async function singleOpenTrialSession(
  ...args: Parameters<typeof sweepTrialSessions>
): Promise<Record<string, string>> {
  return (await sweepTrialSessions(...args)).marker;
}
