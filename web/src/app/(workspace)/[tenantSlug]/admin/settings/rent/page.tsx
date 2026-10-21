// Workspace Settings → Station rent (TUL-1376). Where the OWNER rents a station to a member,
// issues each month's rent, and sees who is working. Under the existing `settings` segment.
import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { rentBillingGate } from "@/lib/service-hub/rent/rent-gate";
import { loadRentSafetyView } from "@/lib/service-hub/rent/rent-safety-view.server";
import { ownerGuard } from "@/lib/service-hub/rent/rent-owner.server";
import { rentLinkState } from "@/lib/service-hub/rent/rent-cycle";
import { RENT_COPY } from "@/lib/service-hub/rent/rent-copy";
import { isPooledKind, type SpaceKind } from "@/lib/spaces/tree";
import { RentCard, type RentMember, type RentPlanView, type RentStationOption } from "./RentCard";

export const dynamic = "force-dynamic";

export default async function RentSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  // Owner-only is enforced HERE, where the data is read, not only in the layout.
  const owner = await ownerGuard();
  if (!owner.ok || owner.tenantId !== scope.tenantId) {
    return (
      <main style={{ padding: 24, maxWidth: 820, fontFamily: "Inter, system-ui, sans-serif" }}>
        <p role="note">{RENT_COPY[locale].notOwner}</p>
      </main>
    );
  }
  const admin = createServiceRoleClient();
  const gate = rentBillingGate();
  const plans: RentPlanView[] = [];
  const members: RentMember[] = [];
  const stations: RentStationOption[] = [];
  let safety: Awaited<ReturnType<typeof loadRentSafetyView>> = [];
  if (admin && gate.ok) {
    const { data: planRows } = await tenantScopedQuery(admin, "studio_rent_plans", scope.tenantId)
      .select("id, talent_profile_id, monthly_rent_cents, rent_percent_bps, currency, status, ended_by, updated_at, station_resource_id, talent_profiles!inner(display_name)")
      .order("updated_at", { ascending: false })
      .limit(60);
    const { data: invRows } = await tenantScopedQuery(admin, "studio_rent_invoices", scope.tenantId)
      .select("plan_id, period, status, payment_link_code")
      .order("period", { ascending: false })
      .limit(120);
    const latest = new Map<string, { period: string; status: string; code: string | null }>();
    for (const i of (invRows ?? []) as Array<{ plan_id: string; period: string; status: string; payment_link_code: string | null }>) {
      if (!latest.has(i.plan_id)) latest.set(i.plan_id, { period: i.period, status: i.status, code: i.payment_link_code });
    }
    const codes = [...latest.values()].map((v) => v.code).filter((c): c is string => !!c);
    const linkStatus = new Map<string, string>();
    if (codes.length > 0) {
      const { data: links } = await tenantScopedQuery(admin, "payment_links", scope.tenantId).select("code, status").in("code", codes);
      for (const l of (links ?? []) as Array<{ code: string; status: string }>) linkStatus.set(l.code, l.status);
    }
    for (const r of (planRows ?? []) as Array<{ id: string; talent_profile_id: string; monthly_rent_cents: number; rent_percent_bps: number | null; currency: string; status: string; ended_by: string | null; station_resource_id: string | null; talent_profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null }>) {
      const tp = Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles;
      // A live plan always shows; a declined or ended one shows so the owner learns the member's answer.
      const inv = latest.get(r.id);
      plans.push({
        id: r.id,
        name: tp?.display_name ?? "",
        monthlyRentCents: r.monthly_rent_cents,
        percentBps: r.rent_percent_bps ?? 0,
        currency: r.currency,
        status: r.status,
        endedBy: r.ended_by,
        stationId: r.station_resource_id,
        invoice: inv ? { period: inv.period, state: rentLinkState(inv.status, inv.code ? (linkStatus.get(inv.code) ?? null) : null) } : null,
      });
    }
    const { data: rosterRows } = await tenantScopedQuery(admin, "agency_talent_roster", scope.tenantId)
      .select("talent_profile_id, talent_profiles!inner(display_name)")
      .neq("status", "removed");
    for (const r of (rosterRows ?? []) as Array<{ talent_profile_id: string; talent_profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null }>) {
      const tp = Array.isArray(r.talent_profiles) ? r.talent_profiles[0] : r.talent_profiles;
      members.push({ talentProfileId: r.talent_profile_id, name: tp?.display_name ?? "" });
    }
    const { data: spaceRows } = await tenantScopedQuery(admin, "spaces", scope.tenantId).select("id, name, kind").order("name", { ascending: true });
    for (const s of (spaceRows ?? []) as Array<{ id: string; name: string; kind: SpaceKind }>) {
      if (isPooledKind(s.kind)) stations.push({ id: s.id, name: s.name });
    }
    safety = await loadRentSafetyView(admin, scope.tenantId);
  }
  return (
    <main style={{ padding: 24, maxWidth: 820, fontFamily: "Inter, system-ui, sans-serif" }}>
      <RentCard locale={locale} gate={gate.ok ? "on" : gate.reason} plans={plans} members={members} stations={stations} safety={safety} />
    </main>
  );
}
