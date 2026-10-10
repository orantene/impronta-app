import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { isRetiredWorkspaceStatus } from "@/lib/saas/workspace-lifecycle";

export type OwnedBusinessWorkspace = {
  ownsBusinessWorkspace: boolean;
  /** Any non-archived cms_pages row (draft or published): enough to edit. */
  hasWorkspaceSite: boolean;
  /** At least one published cms_pages row: the site is live (TUL-371). */
  hasPublishedWorkspaceSite: boolean;
  workspaceSlug: string | null;
  /** Owning business workspace tenant id when known (for live URL / editor resolve). */
  tenantId: string | null;
};

const NONE: OwnedBusinessWorkspace = {
  ownsBusinessWorkspace: false,
  hasWorkspaceSite: false,
  hasPublishedWorkspaceSite: false,
  workspaceSlug: null,
  tenantId: null,
};

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
    const { data: pages, error: pageErr } = await admin
      .from("cms_pages")
      .select("status")
      .eq("tenant_id", row.tenant_id)
      .neq("status", "archived")
      .limit(100);
    if (pageErr) {
      logServerError("talentSite.workspaceContext.pages", pageErr);
      return {
        ownsBusinessWorkspace: true,
        hasWorkspaceSite: false,
        hasPublishedWorkspaceSite: false,
        workspaceSlug: agency.slug,
        tenantId: row.tenant_id,
      };
    }
    const rows = (pages ?? []) as Array<{ status: string | null }>;
    return {
      ownsBusinessWorkspace: true,
      hasWorkspaceSite: rows.length > 0,
      hasPublishedWorkspaceSite: rows.some((p) => p.status === "published"),
      workspaceSlug: agency.slug,
      tenantId: row.tenant_id,
    };
  }
  return NONE;
}
