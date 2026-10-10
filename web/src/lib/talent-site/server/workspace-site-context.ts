import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { isRetiredWorkspaceStatus } from "@/lib/saas/workspace-lifecycle";

export type OwnedBusinessWorkspace = {
  ownsBusinessWorkspace: boolean;
  /** Any non-archived cms_pages row (draft or published) — enough for edit href. */
  hasWorkspaceSite: boolean;
  /**
   * At least one cms_pages row with status=published. Hoy "Sitio en vivo"
   * must require this; draft-only sites are not live (TUL-371 review).
   */
  hasPublishedWorkspaceSite: boolean;
  workspaceSlug: string | null;
  /** Business tenant id when ownership is found; used for public URL resolve. */
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
    // Parallel probes: any editable page vs a published (live) page.
    const [anyRes, publishedRes] = await Promise.all([
      admin
        .from("cms_pages")
        .select("id")
        .eq("tenant_id", row.tenant_id)
        .neq("status", "archived")
        .limit(1),
      admin
        .from("cms_pages")
        .select("id")
        .eq("tenant_id", row.tenant_id)
        .eq("status", "published")
        .limit(1),
    ]);
    if (anyRes.error) {
      logServerError("talentSite.workspaceContext.pages", anyRes.error);
      return {
        ownsBusinessWorkspace: true,
        hasWorkspaceSite: false,
        hasPublishedWorkspaceSite: false,
        workspaceSlug: agency.slug,
        tenantId: row.tenant_id,
      };
    }
    if (publishedRes.error) {
      logServerError("talentSite.workspaceContext.publishedPages", publishedRes.error);
    }
    return {
      ownsBusinessWorkspace: true,
      hasWorkspaceSite: (anyRes.data ?? []).length > 0,
      hasPublishedWorkspaceSite:
        !publishedRes.error && (publishedRes.data ?? []).length > 0,
      workspaceSlug: agency.slug,
      tenantId: row.tenant_id,
    };
  }
  return NONE;
}
