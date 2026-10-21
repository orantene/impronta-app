"use server";

/**
 * TUL-1476 · Read-only: the starting point of the owner's terms step on the three join
 * paths (the workspace's model and whether this user may send terms). Writes nothing.
 */
import { userHasCapability } from "@/lib/access";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadJoinTermsContext } from "@/lib/service-hub/join-terms.server";
import type { WorkModel } from "@/lib/service-hub/terms";

type JoinTermsDefaultsResult =
  | { ok: true; defaultModel: WorkModel; canPropose: boolean; workspaceCurrency: string | null }
  | { ok: false };

export async function loadJoinTermsDefaultsAction(tenantSlug: string): Promise<JoinTermsDefaultsResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false };
  const scope = await getTenantScopeBySlug(String(tenantSlug ?? ""));
  if (!scope) return { ok: false };
  if (!(await userHasCapability("view_dashboard", scope.tenantId))) return { ok: false };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false };
  const ctx = await loadJoinTermsContext(admin, scope.tenantId, session.user.id);
  return { ok: true, ...ctx };
}
