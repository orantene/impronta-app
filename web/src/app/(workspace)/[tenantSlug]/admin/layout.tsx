// Workspace admin layout — cutover version (Phase 3.12 — full surface bridge).
//
// Mounts the prototype shell at every /{tenantSlug}/admin/* route. Pre-fetches
// all surface data in a single parallel Promise.all so the shell opens with
// real data immediately — no loading spinners on first paint.
//
// initialPage is derived from the request pathname so hard refreshes on
// /admin/messages start on the correct surface without a flash.

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadWorkspaceRosterForCurrentTenant,
  loadInquiriesForMessages,
  loadWorkspaceClients,
  loadCalendarEvents,
  loadWorkspaceOverviewMetrics,
  loadWorkspaceBookings,
  loadWorkspaceTeamMembers,
  loadTotalUnreadMessages,
} from "@/app/prototypes/admin-shell/_data-bridge";
import { AdminShellPrototypePageClient } from "@/app/prototypes/admin-shell/_shell-client";
import type { WorkspacePage } from "@/app/prototypes/admin-shell/_state";
import { resolveWorkspaceAdminPage } from "./workspace-page-routing";
import { RealIdentityBanner } from "./_real-identity-banner";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

// Phase 1 — load tenant + session identity for the prototype chrome.
// Failures degrade to null so the layout never crashes; the prototype
// falls back to its hardcoded TENANT/MY_TALENT_PROFILE constants when
// these are absent (standalone demo mode).
async function loadTenantIdentity(tenantId: string): Promise<{
  tenantId: string;
  slug: string;
  displayName: string;
  planTier: string;
  kind: string;
} | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("agencies")
    .select("id, slug, display_name, plan_tier, kind")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) {
    if (error) logServerError("admin-layout.loadTenantIdentity", error);
    return null;
  }
  return {
    tenantId: data.id,
    slug: data.slug ?? "",
    displayName: data.display_name ?? "Workspace",
    planTier: data.plan_tier ?? "free",
    kind: data.kind ?? "agency",
  };
}

async function loadProfileDisplayName(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logServerError("admin-layout.loadProfileDisplayName", error);
    return null;
  }
  return data?.display_name ?? null;
}

export const dynamic = "force-dynamic";

type LayoutParams = Promise<{ tenantSlug: string }>;

/** Derive the workspace page from the raw request pathname. */
function deriveInitialPage(pathname: string, tenantSlug: string): WorkspacePage {
  // Strip leading /{tenantSlug}/admin/ (or /{tenantSlug}/admin) to get segment
  const prefix = `/${tenantSlug}/admin`;
  const after = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  // after is "" | "/messages" | "/messages/…" | "/roster" | etc.
  const segment = after.replace(/^\//, "").split("/")[0] ?? "";
  return resolveWorkspaceAdminPage(segment || "overview");
}

export default async function WorkspaceAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  const { tenantSlug } = await params;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=/${tenantSlug}/admin`);

  // ── Tenant ─────────────────────────────────────────────────────────────────
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // ── Capability ─────────────────────────────────────────────────────────────
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  // ── Derive initialPage from URL (avoids hard-refresh flash) ───────────────
  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? `/${tenantSlug}/admin`;
  const initialPage = deriveInitialPage(pathname, tenantSlug);

  // ── Prefetch all surface data in parallel ──────────────────────────────────
  // Errors in any loader return an empty/null value — never crash the layout.
  const tenantId = scope.tenantId;
  const [
    roster,
    inquiries,
    clients,
    calendarEvents,
    overviewMetrics,
    bookings,
    teamMembers,
    totalUnread,
    tenantIdentity,
    profileDisplayName,
  ] = await Promise.all([
    loadWorkspaceRosterForCurrentTenant(),
    loadInquiriesForMessages(tenantId),
    loadWorkspaceClients(tenantId),
    loadCalendarEvents(tenantId),
    loadWorkspaceOverviewMetrics(tenantId),
    loadWorkspaceBookings(tenantId),
    loadWorkspaceTeamMembers(tenantId),
    loadTotalUnreadMessages(tenantId),
    loadTenantIdentity(tenantId),
    loadProfileDisplayName(session.user.id),
  ]);

  const sessionIdentity = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: scope.membership.role,
    displayName: profileDisplayName,
  };

  return (
    <>
      {/* Real-data banner sits above the prototype chrome until the
          prototype's top-bar identity is migrated to consume the bridge.
          See _real-identity-banner.tsx for the replacement plan. */}
      <RealIdentityBanner
        scope={scope}
        user={{ id: session.user.id, email: session.user.email ?? undefined }}
        metrics={overviewMetrics}
      />
      <AdminShellPrototypePageClient
        tenantSlug={tenantSlug}
        initialPage={initialPage}
        initialBridgeData={{
          roster,
          inquiries,
          clients,
          calendarEvents,
          overviewMetrics,
          bookings,
          teamMembers,
          totalUnread,
          tenantIdentity,
          sessionIdentity,
        }}
      >
        {/* PageRouteSyncer lives here — inside ProtoProvider context, returns null */}
        {children}
      </AdminShellPrototypePageClient>
    </>
  );
}
