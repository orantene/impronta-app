import "server-only";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * The Messages actions' guard: workspace staff, plus the service client the
 * readers use. One shape for `messaging-engine.ts` and `messaging-sheets.ts`.
 */
export async function messagingStaff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin, supabase: guard.supabase };
}
