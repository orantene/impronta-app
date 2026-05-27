// Admin — Roster · Applications (PR-G).
//
// Server-rendered list of pending + decided talent applications for this
// tenant. Reads through `loadAgencyApplications` (RLS-scoped). Approve /
// reject go through `decideTalentApplication`. Approval here flips the
// status only — the roster row insert remains the existing add-talent
// path (use the Roster tab's Invite/Add flow after approval). This is
// intentional; one source of truth for roster inserts.

import { notFound } from "next/navigation";
import Link from "next/link";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadAgencyApplications } from "@/lib/talent/apply-loaders";
import { AdminApplicationsClient } from "@/components/admin/applications/AdminApplicationsClient";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

async function loadAcceptsApplications(tenantId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data } = await admin
    .from("agencies")
    .select("accepts_open_applications")
    .eq("id", tenantId)
    .maybeSingle();
  return (data as { accepts_open_applications: boolean } | null)?.accepts_open_applications ?? false;
}

export default async function AdminRosterApplicationsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Roster admin is the right capability bar — same as Roster tab.
  const canView = await userHasCapability("view_dashboard", scope.tenantId);
  if (!canView) notFound();
  const canDecide = await userHasCapability("manage_talent_roster", scope.tenantId);

  const [applications, acceptsApplications] = await Promise.all([
    loadAgencyApplications(scope.tenantId),
    loadAcceptsApplications(scope.tenantId),
  ]);
  // If a workspace owner hasn't opted in yet, surface a hint.
  const optInHint = applications.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 1024 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Link href={`/${tenantSlug}/admin/roster`} style={{ fontSize: 12.5, color: "#0F4F3E", textDecoration: "underline", width: "fit-content" }}>
          ← Roster
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0B0B0D", lineHeight: 1.1 }}>
          Roster · Applications
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "rgba(11,11,13,0.55)" }}>
          Talent who applied to join your roster. Approve to add — you&apos;ll
          still go through the standard Invite step in the Roster tab so the
          roster row is created with the right contract terms.
        </p>
      </header>
      <AdminApplicationsClient
        applications={applications}
        canDecide={canDecide}
        showOptInHint={optInHint}
        tenantSlug={tenantSlug}
        acceptsApplications={acceptsApplications}
      />
    </div>
  );
}
