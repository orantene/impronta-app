import "server-only";

import { resolveWorkspaceType } from "@/lib/saas/assert-roster-workspace";
import { isEmptyBusinessWorkspace } from "@/lib/seo/business-workspace-seo";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { scopeToSellableOfferings } from "@/lib/offerings/sellable";

/**
 * TUL-591: true when the tenant is a business workspace with no published
 * services and no published pages beyond the system-owned defaults. Fails
 * open (false) on any read problem.
 */
export async function loadIsEmptyBusinessWorkspace(tenantId: string): Promise<boolean> {
  try {
    const workspaceType = await resolveWorkspaceType(tenantId);
    if (workspaceType !== "business") return false;
    const admin = createServiceRoleClient();
    if (!admin) return false;
    const [services, pages] = await Promise.all([
      scopeToSellableOfferings(
        admin.from("talent_offerings").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        "guest_request",
      ),
      admin
        .from("cms_pages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .eq("is_system_owned", false),
    ]);
    if (services.error || pages.error) {
      logServerError("seo.businessEmptiness", services.error ?? pages.error);
      return false;
    }
    return isEmptyBusinessWorkspace({
      workspaceType,
      serviceCount: services.count,
      publishedPageCount: pages.count,
    });
  } catch (error) {
    logServerError("seo.businessEmptiness", error);
    return false;
  }
}
