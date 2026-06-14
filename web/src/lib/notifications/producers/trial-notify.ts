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
