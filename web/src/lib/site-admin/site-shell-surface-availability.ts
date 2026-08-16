"use server";

/**
 * Lane 2 — "is the site shell editing surface reachable for me, right now?"
 *
 * The admin Website page is a CLIENT component, and the shell edit gate
 * (`ENABLE_SITE_SHELL_EDIT`) is a SERVER env flag that must not be leaked into
 * the client bundle. Without an answer the workspace would have to render the
 * "Site header & footer" entry unconditionally — and with the flag off (the
 * shipping default) that entry opens a 404. A dead CTA is worse than no CTA.
 *
 * So the client asks. This action returns true only when ALL of:
 *   1. the caller is signed in and scoped to an agency workspace,
 *   2. the caller has the page-edit capability on that tenant, and
 *   3. `shouldRouteSiteShellSurface` green-lights the tenant.
 *
 * Those are exactly the conditions the `/p/__site_shell__` route itself
 * enforces, so a true answer here means the link resolves rather than 404s.
 *
 * "use server" file: the only export is the async action.
 */

import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
import { requireEditSurfaceTenantScope } from "@/lib/saas/edit-surface-scope";
import { shouldRouteSiteShellSurface } from "@/lib/site-admin/site-shell-flag";

export async function isSiteShellSurfaceAvailableAction(): Promise<boolean> {
  const auth = await requireSession();
  if (!auth.ok) return false;
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return false;
  if (!shouldRouteSiteShellSurface(scope.tenantId)) return false;
  return userHasCapability("agency.site_admin.pages.edit", scope.tenantId);
}
