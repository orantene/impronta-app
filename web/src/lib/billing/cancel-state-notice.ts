/**
 * lib/billing/cancel-state-notice.ts (TUL-832)
 *
 * Confirmation email when a subscription flips cancel_at_period_end, driven by
 * the Stripe webhook (customer.subscription.updated) so portal changes email
 * too. The transition comes from the event's previous_attributes, so a replay
 * of the same event, or an unrelated update, never re-sends. Idempotent per
 * (subscription id, cancel_at_period_end, current_period_end) via an injected
 * ledger. Pure: no Stripe, Supabase or Resend imports.
 */
import type Stripe from "stripe";
import { isCancellationPending } from "@/lib/billing/pending-cancellation";
import { cancelStateSubject, renderCancelStateEmail } from "@/lib/email/subscription-cancel-state";

export type CancelTransition = {
  subscriptionId: string;
  /** New value of cancel_at_period_end. */
  cancelAtPeriodEnd: boolean;
  /** ISO end of the current paid period, null when Stripe omitted it. */
  periodEnd: string | null;
};

/**
 * Returns the transition when this event flipped the pending-cancellation
 * state, else null. State = cancel_at_period_end OR a future cancel_at (the
 * billing portal on API 2026-04-22.dahlia only sets cancel_at). The previous
 * state is the current object overlaid with previous_attributes, judged at the
 * event's own time so a replay decides the same way.
 */
export function detectCancelTransition(event: Stripe.Event): CancelTransition | null {
  if (event.type !== "customer.subscription.updated") return null;
  const prev = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>;
  if (typeof prev.cancel_at_period_end !== "boolean" && !("cancel_at" in prev)) return null;
  const sub = event.data.object as Stripe.Subscription;
  const at = typeof event.created === "number" ? new Date(event.created * 1000) : new Date();
  const was = isCancellationPending(
    {
      cancel_at_period_end: prev.cancel_at_period_end ?? sub.cancel_at_period_end,
      cancel_at: "cancel_at" in prev ? prev.cancel_at : sub.cancel_at,
    },
    at,
  );
  const now = isCancellationPending(sub, at);
  if (now === was) return null;
  // A subscription that already ended has nothing to confirm.
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return null;
  const end = sub.items?.data?.[0]?.current_period_end;
  return {
    subscriptionId: sub.id,
    cancelAtPeriodEnd: now,
    periodEnd: typeof end === "number" ? new Date(end * 1000).toISOString() : null,
  };
}

export function cancelNoticeKey(t: CancelTransition): string {
  return `cancel_state:${t.subscriptionId}:${t.cancelAtPeriodEnd ? "1" : "0"}:${t.periodEnd ?? "none"}`;
}

export type CancelNoticeDeps = {
  /** Insert-if-absent. true = we own this key now. */
  claim(row: { key: string; scope: "talent" | "workspace"; subscriptionId: string; to: string }): Promise<boolean>;
  release(key: string): Promise<void>;
  send(input: { to: string; subject: string; html: string }): Promise<"sent" | "skipped" | "failed">;
};

export type CancelNoticeResult = "sent" | "duplicate" | "no_recipient" | "skipped" | "failed";

export async function sendCancelStateNotice(
  input: {
    transition: CancelTransition;
    scope: "talent" | "workspace";
    to: string | null | undefined;
    locale: "es" | "en";
    actionUrl: string;
  },
  deps: CancelNoticeDeps,
): Promise<CancelNoticeResult> {
  const to = input.to?.trim();
  if (!to) return "no_recipient";
  const t = input.transition;
  const key = cancelNoticeKey(t);
  const owned = await deps.claim({ key, scope: input.scope, subscriptionId: t.subscriptionId, to });
  if (!owned) return "duplicate";
  const result = await deps.send({
    to,
    subject: cancelStateSubject(input.locale, t.cancelAtPeriodEnd),
    html: renderCancelStateEmail({
      locale: input.locale,
      cancelAtPeriodEnd: t.cancelAtPeriodEnd,
      periodEnd: t.periodEnd,
      actionUrl: input.actionUrl,
    }),
  });
  if (result === "failed") {
    await deps.release(key);
    return "failed";
  }
  return result;
}
