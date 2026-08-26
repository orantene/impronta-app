import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { normalizeWorkspaceType, type WorkspaceType } from "@/lib/saas/workspace-type";

/**
 * Read/write for `agencies.workspace_type`.
 *
 * WHY THIS IS ITS OWN MODULE. `agencies` is the tenant table itself: its key is
 * `id`, and it has no `tenant_id` column, so `tenantScopedQuery` — the helper
 * `ratchet/no-untenanted-from` points every server action at — cannot express
 * these queries. Scoping here is the `id = tenantId` predicate, and `tenantId`
 * is a REQUIRED parameter on every function below so a caller cannot construct
 * an unscoped read or write through this API. Callers must still have proven
 * the caller owns that tenant (the server action gates on `manage_billing`
 * through `requireWorkspaceStaffAction` before it ever gets here).
 *
 * Nothing in here touches roster rows, talent profiles, or pitches. The
 * workspace type HIDES surfaces; it never destroys data.
 */

/** Current type for a tenant. Fails closed to "talent" on any read failure. */
export async function readWorkspaceType(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<WorkspaceType | null> {
  const { data, error } = await supabase
    .from("agencies")
    .select("workspace_type")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("workspace-type-store.readWorkspaceType", error);
    return null;
  }
  return normalizeWorkspaceType((data as { workspace_type?: unknown } | null)?.workspace_type);
}

/**
 * Set the tenant's workspace type. This is the ONLY write the whole feature
 * makes — no roster row, talent profile, or pitch is touched, so flipping back
 * restores every surface with the same data behind it.
 */
export async function writeWorkspaceType(
  supabase: SupabaseClient,
  tenantId: string,
  workspaceType: WorkspaceType,
): Promise<boolean> {
  const { error } = await supabase
    .from("agencies")
    .update({ workspace_type: workspaceType, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) {
    logServerError("workspace-type-store.writeWorkspaceType", error);
    return false;
  }
  return true;
}
