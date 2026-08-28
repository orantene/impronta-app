import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Trial-lifecycle producers. Emitted from the Stripe subscription webhook
 * (`customer.subscription.trial_will_end`) and the subscription sync. The
 * catalog entries own BOTH channels (email + in_app); each emit carries a stable
 * `eventId` so a re-delivery collapses via the dispatch_log unique index.
 *
 * Scope routes the recipient: 'workspace' → the agency owner (tenantId set →
 * agency brand); 'talent' → the talent by profile id (tenantId null → Tulala
 * platform brand, since talent Pro/Max is a platform subscription).
 */
export async function notifyTrialWillEnd(params: {
  scope: "workspace" | "talent";
  /** Workspace tenant id, or null for a talent (platform-scoped) subscription. */
  tenantId: string | null;
  /** Set for scope='talent' — drives the talent audience resolver. */
  talentProfileId: string | null;
  subscriptionId: string;
  planKey: string | null;
  /** ISO string of the trial end, or null. */
  trialEndIso: string | null;
}): Promise<void> {
  const type = params.scope === "talent" ? "talent.trial_will_end" : "workspace.trial_will_end";
  // Awaited by the webhook caller: a fire-and-forget tail is dropped once the
  // route responds (Next tears down the request context), so callers in the
  // Stripe webhook handler must await this.
  try {
    await dispatchEventNotifications({
      type,
      tenantId: params.tenantId,
      eventId: `trial-will-end:${params.subscriptionId}:${params.trialEndIso ?? "soon"}`,
      payload: {
        talentProfileId: params.talentProfileId,
        planKey: params.planKey,
        trialEndIso: params.trialEndIso,
      },
    });
  } catch (err) {
    logServerError("notifyTrialWillEnd", err);
  }
}

/**
 * `*.trial_started` — confirm a trial just began. Emitted (fire-and-forget,
 * matching the sibling plan-change notice) from the subscription sync on the
 * transition INTO `trialing`. Dedupes per subscription so re-syncs don't
 * re-notify.
 */
export function notifyTrialStarted(params: {
  scope: "workspace" | "talent";
  tenantId: string | null;
  talentProfileId: string | null;
  subscriptionId: string;
  planKey: string | null;
  trialEndIso: string | null;
}): void {
  const type = params.scope === "talent" ? "talent.trial_started" : "workspace.trial_started";
  void dispatchEventNotifications({
    type,
    tenantId: params.tenantId,
    eventId: `trial-started:${params.subscriptionId}`,
    payload: {
      talentProfileId: params.talentProfileId,
      planKey: params.planKey,
      trialEndIso: params.trialEndIso,
    },
  }).catch((err) => {
    logServerError("notifyTrialStarted", err);
  });
}

/**
 * `*.discount_ending` — a time-boxed subscription discount lapses soon.
 *
 * Deliberately NOT a trial notice. Stripe emits `trial_will_end` before a trial
 * converts, but emits nothing at all before a coupon expires — the next invoice
 * is simply larger. That silence is what turns a generous campaign ("two months
 * free") into refund requests, so this is produced by a scheduled sweep over
 * the mirrored `discount_ends_at` rather than by a webhook.
 *
 * The eventId is keyed on the subscription AND the end date, so the daily sweep
 * can run every day inside the warning window while the dispatch_log unique
 * index collapses it to exactly one send per discount.
 */
export async function notifyDiscountEnding(params: {
  scope: "workspace" | "talent";
  tenantId: string | null;
  talentProfileId: string | null;
  subscriptionId: string;
  planKey: string | null;
  discountEndsIso: string | null;
  /** Pre-formatted amount of the next full-price invoice, e.g. "$29". */
  nextAmountLabel: string | null;
}): Promise<void> {
  const type = params.scope === "talent" ? "talent.discount_ending" : "workspace.discount_ending";
  try {
    await dispatchEventNotifications({
      type,
      tenantId: params.tenantId,
      eventId: `discount-ending:${params.subscriptionId}:${params.discountEndsIso ?? "soon"}`,
      payload: {
        talentProfileId: params.talentProfileId,
        planKey: params.planKey,
        discountEndsIso: params.discountEndsIso,
        nextAmountLabel: params.nextAmountLabel,
      },
    });
  } catch (err) {
    logServerError("notifyDiscountEnding", err);
  }
}
