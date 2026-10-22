/**
 * TUL-1931: IndexNow must not ping for demo/test workspaces. `agencies` has no is_demo column, so a workspace is real
 * only when an active owner is not a test account (shared rule in @/lib/saas/test-account-rule). One owner lookup plus
 * flags; any error or missing client fails closed (false = skip the ping).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { tenantsWithRealOwner } from "@/lib/saas/test-account-rule";

export async function tenantHasRealOwnerForIndexNow(
  admin: SupabaseClient | null | undefined,
  tenantId: string,
): Promise<boolean> {
  if (!admin) return false;
  try {
    const { data: members, error } = await admin
      .from("agency_memberships")
      .select("tenant_id, profile_id")
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .eq("status", "active")
      .is("removed_at", null);
    if (error) return false;
    const ownerIds = [...new Set(((members ?? []) as Array<{ profile_id: string }>).map((m) => m.profile_id))];
    if (ownerIds.length === 0) return false;

    const [profileFlags, talentFlags] = await Promise.all([
      admin.from("profiles").select("id").in("id", ownerIds).eq("is_test_account", true),
      admin.from("talent_profiles").select("user_id").in("user_id", ownerIds).or("is_test_account.eq.true,is_demo.eq.true"),
    ]);
    if (profileFlags.error || talentFlags.error) return false;
    const flagged = new Set<string>();
    for (const r of (profileFlags.data ?? []) as Array<{ id: string }>) flagged.add(r.id);
    for (const r of (talentFlags.data ?? []) as Array<{ user_id: string | null }>) if (r.user_id) flagged.add(r.user_id);

    const emailByUser = new Map<string, string>();
    await Promise.all(
      ownerIds
        .filter((id) => !flagged.has(id))
        .map(async (id) => {
          const { data, error: userError } = await admin.auth.admin.getUserById(id);
          if (userError) throw userError;
          if (data?.user?.email) emailByUser.set(id, data.user.email);
        }),
    );
    return tenantsWithRealOwner({
      ownersByTenant: new Map([[tenantId, ownerIds]]),
      emailByUser,
      flaggedUserIds: flagged,
    }).has(tenantId);
  } catch {
    return false;
  }
}
