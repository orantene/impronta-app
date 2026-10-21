/**
 * trial-session-reconcile.ts (TUL-1280 race close): create-then-reconcile so
 * at most ONE open trial Checkout session survives per Stripe customer, even
 * when two are created in the same instant. No migration.
 *
 * After creating a session that carries a trial, the creator lists the
 * customer's open trial sessions (marked by TRIAL_SESSION_MARKER) and sorts
 * them deterministically (created asc, then id asc). The OLDEST wins:
 *   - this session is the winner: expire every other open trial session;
 *   - otherwise: expire this session and hand back the winner's URL only when
 *     the winner charges exactly what this request asked for (the full price
 *     identity: plan, interval, price id/currency, discount; see
 *     trial-price-identity.ts). Any other price is never substituted: the
 *     buyer gets a retryable error instead.
 *
 * Why at most one survives: take any two trial sessions S and T. Each creator
 * lists AFTER its own create, so whichever of the two was committed later is
 * listed by its creator together with the other one. That creator either
 * expires its own session (not the oldest it sees) or expires every other one
 * it sees (it is the oldest): either way S or T ends expired. The globally
 * oldest is never expired (it is the oldest in every list that contains it),
 * so exactly one survives.
 *
 * Assumptions, stated: Stripe's list reflects a create that has returned
 * (list-after-create consistency), and expire succeeds (one retry each). If the
 * reconcile list fails twice we fail CLOSED: expire our own session when
 * another trial session is already known open, otherwise keep it and log.
 */

import { createTranslator } from "@/i18n/messages";
import { TRIAL_SESSION_MARKER } from "./trial-checkout-session";
import { TRIAL_PRICE_IDENTITY } from "./trial-price-identity";

/** Shown when the race leaves this request without a usable checkout; a retry succeeds. */
export const TRIAL_RACE_RETRY_ERROR = "Another checkout was opened at the same time. Please try again.";

/** TUL-1412: the same message in the buyer's locale (catalog key admin.account.billing.trialRaceRetry). EN stays TRIAL_RACE_RETRY_ERROR. */
export function trialRaceRetryError(locale?: string | null): string {
  return createTranslator(locale ?? "en")("admin.account.billing.trialRaceRetry");
}

export type ReconcileSession = {
  id: string;
  created: number;
  url?: string | null;
  metadata?: Record<string, string> | null;
};

export type ReconcileStripe = {
  checkout: {
    sessions: {
      list: (params: { customer: string; status: "open"; limit: number }) => Promise<{
        data: ReconcileSession[];
        has_more?: boolean;
      }>;
      expire: (id: string) => Promise<unknown>;
    };
  };
};

type OnError = (where: string, err: unknown) => void;

const isTrial = (s: ReconcileSession) => Boolean(s.metadata?.[TRIAL_SESSION_MARKER]);

/** The deterministic winner among trial sessions: oldest `created`, then smallest id. */
export function pickTrialWinner<T extends ReconcileSession>(sessions: T[]): T | null {
  const trial = sessions.filter(isTrial);
  trial.sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return trial[0] ?? null;
}

async function expireWithRetry(stripe: ReconcileStripe, id: string, onError: OnError): Promise<void> {
  try {
    await stripe.checkout.sessions.expire(id);
  } catch {
    try {
      await stripe.checkout.sessions.expire(id);
    } catch (err) {
      onError("billing.trialSession.reconcileExpire", err);
    }
  }
}

async function listOpen(stripe: ReconcileStripe, customerId: string): Promise<ReconcileSession[]> {
  const params = { customer: customerId, status: "open" as const, limit: 100 };
  const page = await stripe.checkout.sessions.list(params).catch(() => stripe.checkout.sessions.list(params));
  if (page.has_more) throw new Error("trial reconcile: more than 100 open sessions");
  return page.data;
}

/** The URL to send the buyer to, or a retryable error. Never creates or edits a session. */
export async function reconcileTrialSession(
  stripe: ReconcileStripe | null,
  customerId: string,
  own: { id: string; url: string },
  opts: { otherTrialKnownOpen: boolean; requestedPriceIdentity?: string | null; onError: OnError; locale?: string | null },
): Promise<{ url: string } | { error: string }> {
  if (!stripe) return { url: own.url };

  let open: ReconcileSession[];
  try {
    open = await listOpen(stripe, customerId);
  } catch (err) {
    opts.onError("billing.trialSession.reconcileList", err);
    if (!opts.otherTrialKnownOpen) return { url: own.url };
    await expireWithRetry(stripe, own.id, opts.onError);
    return { error: trialRaceRetryError(opts.locale) };
  }

  const winner = pickTrialWinner(open);
  if (winner?.id === own.id) {
    for (const s of open) {
      if (isTrial(s) && s.id !== own.id) await expireWithRetry(stripe, s.id, opts.onError);
    }
    return { url: own.url };
  }
  // Not the winner (or already expired, e.g. a replayed idempotency key).
  if (open.some((s) => s.id === own.id)) await expireWithRetry(stripe, own.id, opts.onError);
  if (!winner?.url) return { error: trialRaceRetryError(opts.locale) };
  // Wrong-price guard: a winner without an identity (older session) counts as a mismatch.
  const winnerIdentity = winner.metadata?.[TRIAL_PRICE_IDENTITY] ?? null;
  if (opts.requestedPriceIdentity && winnerIdentity !== opts.requestedPriceIdentity) return { error: trialRaceRetryError(opts.locale) };
  return { url: winner.url };
}
