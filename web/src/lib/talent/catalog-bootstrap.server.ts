import "server-only";

import { getAdminWorkspaceScope } from "@/lib/saas/admin-workspace-scope";
import { loadWorkspaceMenuForEditor } from "@/lib/talent/menu-offerings-actions";

/**
 * B5 (TUL-1271 #12): what the workspace Catalog needs for its FIRST paint,
 * loaded on the server by the `/admin/catalog` and `/admin/menu` routes.
 *
 * The client used to fire `loadWorkspaceMenuForEditor` as a server action on
 * mount. Next runs a client's server actions one at a time, so on a fresh
 * visit it queued behind the shell's own mount-time actions, and a navigation
 * that lands while an action is pending DISCARDS it (its promise never
 * settles; next/dist/client/components/app-router-instance.js). The editor's
 * 10 s settle budget then fired, waited 2 s and retried: the 10 to 18 s QA
 * measured on every visit. The talent Services page had the same wait and the
 * same cure (TUL-824, services-bootstrap.server.ts).
 *
 * The loader keeps every check it has as an action (staff session, workspace
 * membership, capability, tenant pin); the tenant comes from the request's
 * workspace surface, never from the client. Any failure is null and the
 * editor falls back to its own action.
 */
export type CatalogBootstrap = {
  tenantId: string;
  result: Awaited<ReturnType<typeof loadWorkspaceMenuForEditor>>;
} | null;

export async function loadCatalogBootstrap(): Promise<CatalogBootstrap> {
  try {
    const scope = await getAdminWorkspaceScope();
    if (!scope) return null;
    const result = await loadWorkspaceMenuForEditor(scope.tenantId);
    return { tenantId: scope.tenantId, result };
  } catch {
    return null;
  }
}
