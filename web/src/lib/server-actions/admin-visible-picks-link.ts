"use server";

/**
 * TUL-1687 / TUL-1716: should Settings show the link to "Who stays visible"
 * (/admin/settings/visible-picks)? Only when HUB_PLAN_CAP_PICKS_ENABLED=1 (the same flag
 * that shows the page and makes the public directory honour picks) AND the caller may
 * edit the roster (`agency.roster.edit`, the capability the pick action itself checks).
 *
 * Read only, and this loader runs on EVERY Settings open — it must never write an audit
 * row. TUL-1716: the previous version resolved the tenant via the workspace staff guard
 * this repo uses on tenant-scoped admin actions, which is safe when called with no
 * capability option (the default capability is held by every active member, including a
 * viewer) but writes a "permission denied" row on a miss whenever a capability option is
 * passed to it — so checking `agency.roster.edit` by passing it to that guard would have
 * audit-spammed every non-editor's Settings open. Resolve session + workspace scope with
 * the two building blocks that guard composes internally (requireSession,
 * getAdminWorkspaceScope) and check the capability with userHasCapability, which never
 * writes an audit row on a miss. Any error hides the link.
 */
import { userHasCapability } from "@/lib/access";
import { getAdminWorkspaceScope } from "@/lib/saas/admin-workspace-scope";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { visiblePicksEnabled, visiblePicksLinkShown } from "@/lib/service-hub/visible-picks";

export type VisiblePicksLinkResult = { show: boolean };

/**
 * Test-only injection seam: a caller may hand in fakes for the session /
 * scope / capability lookups instead of going through the real
 * cookie-backed session and request-cached workspace scope. Production code
 * never passes this — see `admin-visible-picks-link.test.ts`.
 */
export type LoadVisiblePicksLinkDeps = {
  requireSession?: typeof requireSession;
  getAdminWorkspaceScope?: typeof getAdminWorkspaceScope;
  userHasCapability?: typeof userHasCapability;
};

export async function loadVisiblePicksLink(
  deps?: LoadVisiblePicksLinkDeps,
): Promise<VisiblePicksLinkResult> {
  if (!visiblePicksEnabled()) return { show: false };
  try {
    const resolveSession = deps?.requireSession ?? requireSession;
    const resolveScope = deps?.getAdminWorkspaceScope ?? getAdminWorkspaceScope;
    const hasCapability = deps?.userHasCapability ?? userHasCapability;

    const session = await resolveSession();
    if (!session.ok) return { show: false };
    const scope = await resolveScope();
    if (!scope) return { show: false };
    const canEditRoster = await hasCapability("agency.roster.edit", scope.tenantId);
    return { show: visiblePicksLinkShown({ flagOn: true, canEditRoster }) };
  } catch (err) {
    logServerError("serviceHub.visiblePicks.link", err);
    return { show: false };
  }
}
