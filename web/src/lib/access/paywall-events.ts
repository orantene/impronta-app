import "server-only";

import { logAnalyticsEventServer } from "@/lib/analytics/server-log";

/**
 * paywall-events.ts — the one event that tells us whether a gate earns its keep.
 *
 * Every plan denial fires `paywall.hit`. Without it a packaging decision is
 * unfalsifiable: we would know how many people subscribed but not which wall
 * they hit on the way, so we could never tell a gate that converts from a gate
 * that only annoys. The commerce audit found the platform had no commercial
 * event spine at all — no plan view, no checkout start, no paywall hit — which
 * is why "which gate should we build next" had no evidence behind it.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY
 * ───────────────────────────────────
 * No user id and no actor. A paywall hit is a fact about a TENANT's plan and a
 * capability, and attaching a person turns a packaging metric into behavioural
 * tracking of named staff for no analytical gain. `tenant_id` is enough to
 * answer every question we actually have.
 *
 * NEVER THROWS, NEVER BLOCKS
 * ──────────────────────────
 * Called with `void` from inside the authorization path. An analytics outage
 * must not turn into an authorization outage — and note the denial has ALREADY
 * been decided when this runs, so a failure here cannot change who gets in.
 * `logAnalyticsEventServer` swallows its own errors; the try/catch is the
 * second belt.
 */

export type PaywallHit = {
  capability: string;
  tenantId: string;
  /** The plan that denied. */
  currentPlan: string;
  /** Cheapest plan that would grant it, or null when none is self-serve. */
  offeredPlan: string | null;
};

export async function recordPaywallHit(hit: PaywallHit): Promise<void> {
  try {
    await logAnalyticsEventServer({
      name: "paywall.hit",
      tenantId: hit.tenantId,
      payload: {
        capability: hit.capability,
        current_plan: hit.currentPlan,
        offered_plan: hit.offeredPlan,
        // Whether the denial had anywhere to send them. A hit with no offer is
        // the most interesting row in the table: it means we withheld something
        // and could not say what to buy, which is a packaging bug, not a funnel.
        has_offer: hit.offeredPlan !== null,
      },
    });
  } catch {
    // Swallowed on purpose. See the module header.
  }
}
