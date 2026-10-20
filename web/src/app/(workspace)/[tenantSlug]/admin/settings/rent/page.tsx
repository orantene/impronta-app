// Workspace Settings → Station rent (TUL-1376). Where the OWNER rents a station to a member,
// issues each month's rent, and sees who is working. Under the existing `settings` segment.
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { rentBillingGate } from "@/lib/service-hub/rent/rent-gate";
import { loadRentSafetyView } from "@/lib/service-hub/rent/rent-safety-view.server";
import { RentCard, type RentMember, type RentPlanView } from "./RentCard";

export const dynamic = "force-dynamic";

export default async function RentSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const admin = createServiceRoleClient();
  const gate = rentBillingGate();
  const plans: RentPlanView[] = [];
  const members: RentMember[] = [];
  let safety: Awaited<ReturnType<typeof loadRentSafetyView>> = [];
  if (admin && gate.ok) {
    const { data: planRows } = await tenantScopedQuery(admin, "studio_rent_plans", scope.tenantId)
      .select("id, talent_profile_id, monthly_rent_cents, currency, status, talent_profiles!inner(display_name)")
      .neq("status", "declined")
      .neq("status", "ended");
    for (const r of (planRows ?? []) as Array<{ id: string; talent_profile_id: string; monthly_rent_cents: number; currency: string; status: string; talent_profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null }>) {
      const tp = Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles;
      plans.push({ id: r.id, name: tp?.display_name ?? "", monthlyRentCents: r.monthly_rent_cents, currency: r.currency, status: r.status });
    }
    const { data: rosterRows } = await tenantScopedQuery(admin, "agency_talent_roster", scope.tenantId)
      .select("talent_profile_id, talent_profiles!inner(display_name)")
      .neq("status", "removed");
    for (const r of (rosterRows ?? []) as Array<{ talent_profile_id: string; talent_profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null }>) {
      const tp = Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles;
      members.push({ talentProfileId: r.talent_profile_id, name: tp?.display_name ?? "" });
    }
    safety = await loadRentSafetyView(admin, scope.tenantId);
  }
  return (
    <main style={{ padding: 24, maxWidth: 820, fontFamily: "Inter, system-ui, sans-serif" }}>
      <RentCard locale={locale} gate={gate.ok ? "on" : gate.reason} plans={plans} members={members} safety={safety} />
    </main>
  );
}
