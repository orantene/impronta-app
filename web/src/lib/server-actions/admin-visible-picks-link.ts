"use server";

/**
 * TUL-1687: should Settings show the link to "Who stays visible"
 * (/admin/settings/visible-picks)? Only when HUB_PLAN_CAP_PICKS_ENABLED=1 (the same flag
 * that shows the page and makes the public directory honour picks) AND the caller may
 * edit the roster (`agency.roster.edit`, the capability the pick action itself checks).
 *
 * Read only. The tenant comes from the session scope, never from client input. The
 * capability is checked with userHasCapability directly, not with
 * requireWorkspaceStaffAction with a capability option, because that guard writes a
 * "permission denied" audit row on a miss and this runs on every Settings open.
 * Any error hides the link.
 */
import { userHasCapability } from "@/lib/access";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { visiblePicksEnabled, visiblePicksLinkShown } from "@/lib/service-hub/visible-picks";

export type VisiblePicksLinkResult = { show: boolean };

export async function loadVisiblePicksLink(): Promise<VisiblePicksLinkResult> {
  if (!visiblePicksEnabled()) return { show: false };
  try {
    const guard = await requireWorkspaceStaffAction();
    if (!guard.ok) return { show: false };
    const canEditRoster = await userHasCapability("agency.roster.edit", guard.tenantId);
    return { show: visiblePicksLinkShown({ flagOn: true, canEditRoster }) };
  } catch (err) {
    logServerError("serviceHub.visiblePicks.link", err);
    return { show: false };
  }
}
