import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { isRetiredWorkspaceStatus } from "@/lib/saas/workspace-lifecycle";

export type OwnedBusinessWorkspace = {
  ownsBusinessWorkspace: boolean;
  hasWorkspaceSite: boolean;
  workspaceSlug: string | null;
};

const NONE: OwnedBusinessWorkspace = { ownsBusinessWorkspace: false, hasWorkspaceSite: false, workspaceSlug: null };

type AgencyJoin = { slug: string | null; status: string | null; workspace_type: string | null };

/**
 * TUL-77: does this user OWN a business workspace, and does it have a site?
 * A read failure answers "no" (the old behaviour), logged, never thrown.
 */
export async function loadOwnedBusinessWorkspace(
  admin: Pick<SupabaseClient, "from">,
  userId: string,
): Promise<OwnedBusinessWorkspace> {
  const { data, error } = await admin
    .from("agency_memberships")
    .select("tenant_id, agencies:tenant_id ( slug, status, workspace_type )")
    .eq("profile_id", userId)
    .eq("role", "owner")
    .eq("status", "active");
  if (error) {
    logServerError("talentSite.workspaceContext.memberships", error);
    return NONE;
  }
  for (const row of (data ?? []) as unknown as Array<{ tenant_id: string; agencies: AgencyJoin | AgencyJoin[] | null }>) {
    const agency = Array.isArray(row.agencies) ? row.agencies[0] ?? null : row.agencies;
    if (!agency?.slug || agency.workspace_type !== "business" || isRetiredWorkspaceStatus(agency.status)) continue;
    const { data: page, error: pageErr } = await admin
      .from("cms_pages")
      .select("id")
      .eq("tenant_id", row.tenant_id)
      .neq("status", "archived")
      .limit(1);
    if (pageErr) {
      logServerError("talentSite.workspaceContext.pages", pageErr);
      return { ownsBusinessWorkspace: true, hasWorkspaceSite: false, workspaceSlug: agency.slug };
    }
    return { ownsBusinessWorkspace: true, hasWorkspaceSite: (page ?? []).length > 0, workspaceSlug: agency.slug };
  }
  return NONE;
}
