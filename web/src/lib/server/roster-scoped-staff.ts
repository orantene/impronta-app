import { requireStaff } from "@/lib/server/action-guards";
import { getTenantScope } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * `requireStaff()` is a GLOBAL-role gate: every self-serve studio owner holds
 * app_role 'agency_staff', so on its own it admits an owner to ANOTHER
 * workspace's talent. Mutations on a talent profile must also prove the talent
 * is on the caller's active workspace roster. Platform super_admins keep
 * god-mode (they have no workspace to scope to).
 */
export async function requireRosterScopedStaff(
  talentIds: string[],
): Promise<Awaited<ReturnType<typeof requireStaff>>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;
  if (auth.profile?.app_role === "super_admin") return auth;
  const ids = [...new Set(talentIds.filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "Not authorized." };
  const scope = await getTenantScope();
  if (!scope?.tenantId) return { ok: false, error: "Not authorized." };
  const { data, error } = await tenantScopedQuery(
    auth.supabase,
    "agency_talent_roster",
    scope.tenantId,
  )
    .select("talent_profile_id")
    .neq("status", "removed")
    .in("talent_profile_id", ids);
  if (error) {
    logServerError("roster-scoped-staff", error);
    return { ok: false, error: "Not authorized." };
  }
  const onRoster = new Set((data ?? []).map((r) => r.talent_profile_id as string));
  if (!ids.every((id) => onRoster.has(id))) {
    return { ok: false, error: "That talent isn't on your roster." };
  }
  return auth;
}
