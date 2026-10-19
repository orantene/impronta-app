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
 * Residual race: two creates in the same instant can each list before the
 * other exists. This MITIGATES the double trial; it does not eliminate it.
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
 * ADD to this session's metadata ({} when this checkout carries no trial).
 */
export async function singleOpenTrialSession(
  stripe: SessionStripe | null,
  customerId: string,
  trialDays: number | null,
  idempotencyKey: string,
  onError: (where: string, err: unknown) => void,
): Promise<Record<string, string>> {
  if (trialDays == null || trialDays <= 0) return {};
  const marker = { [TRIAL_SESSION_MARKER]: idempotencyKey };
  if (!stripe) return marker;

  let open: { id: string; metadata?: Record<string, string> | null }[];
  try {
    open = (await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })).data;
  } catch (err) {
    onError("billing.trialSession.list", err);
    return marker;
  }
  for (const s of open) {
    const key = s.metadata?.[TRIAL_SESSION_MARKER];
    if (!key || key === idempotencyKey) continue;
    try {
      await stripe.checkout.sessions.expire(s.id);
    } catch (err) {
      onError("billing.trialSession.expire", err);
    }
  }
  return marker;
}
