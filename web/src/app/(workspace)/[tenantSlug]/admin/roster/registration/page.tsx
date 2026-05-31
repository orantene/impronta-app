// Admin — Roster · Registration (Tenant Registration Engine, S1).
//
// Server-rendered settings surface for the per-workspace "Open for
// registration" policy. Manager+ (manage_talent_roster) can edit; everyone
// with view_dashboard can see the current state. The mode picker is gated to
// the plan via registrationModesForPlan; the save action re-validates
// server-side so the gate can't be bypassed from the client.

import { notFound } from "next/navigation";
import Link from "next/link";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getPlan, isKnownPlan } from "@/lib/access/plan-catalog";
import { registrationModesForPlan } from "@/lib/access/registration-modes";
import { loadRegistrationSettings } from "@/lib/saas/registration-settings";
import { RegistrationSettingsClient } from "@/components/admin/registration/RegistrationSettingsClient";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function AdminRosterRegistrationPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("view_dashboard", scope.tenantId);
  if (!canView) notFound();
  const canManage = await userHasCapability("manage_talent_roster", scope.tenantId);

  const admin = createServiceRoleClient();
  const { data: agency } = admin
    ? await admin
        .from("agencies")
        .select("plan_tier, kind")
        .eq("id", scope.tenantId)
        .maybeSingle()
    : { data: null };

  const planTier = String(agency?.plan_tier ?? "free");
  const kind = agency?.kind === "hub" ? "hub" : "agency";
  const planLabel = isKnownPlan(planTier) ? getPlan(planTier).displayName : "Free";
  const allowedModes = registrationModesForPlan(planTier, kind);

  const settings = await loadRegistrationSettings(scope.tenantId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 1024 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Link
          href={`/${tenantSlug}/admin/roster`}
          style={{ fontSize: 12.5, color: "#0F4F3E", textDecoration: "underline", width: "fit-content" }}
        >
          ← Roster
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0B0B0D", lineHeight: 1.1 }}>
          Open for registration
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "rgba(11,11,13,0.55)", maxWidth: 640 }}>
          Let talent join your roster directly from your public site. Choose how
          new registrations are handled — instantly, by approval, or as exclusive
          representation — and add a &ldquo;Join the team&rdquo; button to your site.
        </p>
      </header>

      <RegistrationSettingsClient
        tenantSlug={tenantSlug}
        canManage={canManage}
        planLabel={planLabel}
        allowedModes={allowedModes}
        initial={{
          enabled: settings.enabled,
          mode: settings.mode,
          defaultRosterVisibility: settings.defaultRosterVisibility,
          ctaLabel: settings.ctaLabel,
        }}
      />

      <p style={{ margin: 0, fontSize: 12.5, color: "rgba(11,11,13,0.55)" }}>
        Looking for talent who already applied?{" "}
        <Link
          href={`/${tenantSlug}/admin/roster/applications`}
          style={{ color: "#0F4F3E", textDecoration: "underline" }}
        >
          Roster · Applications
        </Link>
      </p>
    </div>
  );
}
