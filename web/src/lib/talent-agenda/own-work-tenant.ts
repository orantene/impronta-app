/**
 * Stage B1 — resolve the tenant for a talent's own Calendar commercial work.
 *
 * Private bookings / quotes / hold converts live on the platform hub
 * (DECISIONS #1 / ENGINE-MAP). Agency work stays on the agency tenant and
 * does not use these writers.
 */

import "server-only";

import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { talentIsSeller } from "@/lib/messaging/talent-pov";

export type OwnWorkTenant =
  | { ok: true; tenantId: string }
  | { ok: false; reason: "no_hub" };

/**
 * Hub tenant for talent-owned Agenda writers. She is always the seller here
 * (`talentIsSeller(hub, hub)`).
 */
export async function resolveTalentOwnWorkTenant(): Promise<OwnWorkTenant> {
  const hub = await getPlatformHubTenant();
  if (!hub?.tenantId) return { ok: false, reason: "no_hub" };
  if (!talentIsSeller(hub.tenantId, hub.tenantId)) {
    return { ok: false, reason: "no_hub" };
  }
  return { ok: true, tenantId: hub.tenantId };
}
