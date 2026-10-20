import "server-only";

/**
 * TUL-1376: loads the safety view for one workspace. The renting members come from THIS
 * workspace's accepted plans, and only bookings made IN THIS workspace are read (scoped by
 * tenant_id): a member's bookings on their own site, the hub or another workspace are never
 * shown, because the member consented to rent here only. No client contact is read at all.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { shapeSafetyRows, type SafetyBookingRow, type SafetyPlan, type SafetyRow } from "./rent-safety-view";

export async function loadRentSafetyView(admin: SupabaseClient, tenantId: string, now: Date = new Date()): Promise<SafetyRow[]> {
  const { data: planRows, error } = await tenantScopedQuery(admin, "studio_rent_plans", tenantId)
    .select("talent_profile_id, status, talent_profiles!inner(display_name)")
    .in("status", ["active", "paused"]);
  if (error) {
    logServerError("rent.safety.plans", error);
    return [];
  }
  const plans: SafetyPlan[] = ((planRows ?? []) as Array<{ talent_profile_id: string; status: string; talent_profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null }>).map((r) => {
    const tp = Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles;
    return { talentProfileId: r.talent_profile_id, memberName: tp?.display_name ?? "", status: r.status };
  });
  if (plans.length === 0) return [];
  const { data: bookings, error: bErr } = await tenantScopedQuery(admin, "talent_bookings", tenantId)
    .select("id, tenant_id, talent_profile_id, title, client_label, starts_at, ends_at, status")
    .in("talent_profile_id", plans.map((p) => p.talentProfileId))
    .eq("status", "confirmed")
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(200);
  if (bErr) {
    logServerError("rent.safety.bookings", bErr);
    return [];
  }
  return shapeSafetyRows(tenantId, plans, (bookings ?? []) as SafetyBookingRow[], now);
}
