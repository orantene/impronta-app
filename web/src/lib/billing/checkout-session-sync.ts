/**
 * checkout-session-sync.ts (TUL-836 session sync). After Checkout redirects
 * back, the success page re-reads the Stripe subscription once and runs the
 * same single writer the webhook uses, so the plan updates even when the
 * webhook is late. This module is the pure owner check; the Stripe read and
 * the write live in checkout-session-sync.server.ts.
 */

export function isCheckoutSessionId(raw: unknown): raw is string {
  return typeof raw === "string" && /^cs_(test|live)_[A-Za-z0-9]+$/.test(raw);
}

export type CheckoutSessionLike = {
  status?: string | null;
  mode?: string | null;
  subscription?: string | { id: string } | null;
  metadata?: Record<string, string | undefined> | null;
};

export type CheckoutSessionSyncDecision =
  | { ok: true; subscriptionId: string; planKey: "talent_pro" | "talent_portfolio" }
  | { ok: false; reason: "not_owner" | "not_complete" | "not_talent" | "no_subscription" };

export function decideCheckoutSessionSync(input: {
  session: CheckoutSessionLike;
  ownerProfileId: string;
  ownerUserId: string;
}): CheckoutSessionSyncDecision {
  const meta = input.session.metadata ?? {};
  if (meta.checkout_type !== "talent_subscription" || input.session.mode !== "subscription") {
    return { ok: false, reason: "not_talent" };
  }
  if (meta.talent_profile_id !== input.ownerProfileId || meta.user_id !== input.ownerUserId) {
    return { ok: false, reason: "not_owner" };
  }
  if (input.session.status !== "complete") return { ok: false, reason: "not_complete" };
  const sub = input.session.subscription;
  const subscriptionId = typeof sub === "string" ? sub : sub?.id ?? null;
  if (!subscriptionId) return { ok: false, reason: "no_subscription" };
  const planKey = meta.plan_key === "talent_portfolio" ? "talent_portfolio" : "talent_pro";
  return { ok: true, subscriptionId, planKey };
}
