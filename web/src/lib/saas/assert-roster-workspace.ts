import "server-only";

import { notFound } from "next/navigation";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { normalizeWorkspaceType, rosterEnabled, type WorkspaceType } from "@/lib/saas/workspace-type";

/**
 * Server-side half of the business-workspace roster guard.
 *
 * The SPA clamp in the admin layout covers the shell's own nav and the
 * SPA-rendered `/admin/roster` page. It does NOT cover the roster's own
 * server-rendered routes (`/admin/roster/new`, `/admin/roster/applications`,
 * …), which render before the shell state exists. Those call this.
 *
 * FAIL OPEN ON INFRASTRUCTURE, CLOSED ON DATA. A missing service-role client or
 * a failed query means we do not KNOW the workspace type — and the overwhelming
 * majority of workspaces are "talent". 404-ing an agency's roster because a
 * query blipped is far worse than briefly rendering a page a business workspace
 * would not have navigated to on its own. Only a row that positively says
 * `workspace_type = 'business'` triggers the 404.
 */
export async function resolveWorkspaceType(tenantId: string): Promise<WorkspaceType> {
  if (!tenantId) return "talent";
  const admin = createServiceRoleClient();
  if (!admin) return "talent";
  const { data, error } = await admin
    .from("agencies")
    .select("workspace_type")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("assert-roster-workspace.resolveWorkspaceType", error);
    return "talent";
  }
  return normalizeWorkspaceType((data as { workspace_type?: unknown } | null)?.workspace_type);
}

/**
 * `notFound()` when this tenant is a business workspace — it represents no
 * talent, so roster routes do not exist for it.
 *
 * Nothing is deleted or archived by the workspace type: flipping back to
 * "talent" makes every one of these routes reachable again, with the same rows
 * behind them.
 */
export async function assertRosterWorkspace(tenantId: string): Promise<void> {
  const type = await resolveWorkspaceType(tenantId);
  if (!rosterEnabled(type)) notFound();
}
