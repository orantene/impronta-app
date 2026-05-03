// Phase 3 — canonical workspace admin shell.
// Server Component — no "use client".
//
// Resolves tenant from the URL slug (not from the host header or active-tenant
// cookie — this route lives on app.tulala.digital where the host sets no
// tenant header). Gates on `agency.workspace.view` so non-members 404 rather
// than seeing a partial render.
//
// Shell re-uses the same AdminDashboardShell + AdminWorkspaceShell as the
// legacy (dashboard)/admin layout. Shell-level data loaders (pulseCounts,
// tier1AlertCount, workspaceSummary) fall through to the user's resolved
// getTenantScope() because those loaders are not yet tenantId-parameterised.
// For single-tenant users (the Phase 3.1 QA case) this is correct. Phase 3.x
// will parameterise the loaders to support multi-tenant context switching via
// the URL slug rather than the active-tenant cookie.

import { Suspense } from "react";
import { Toaster } from "sonner";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceShell } from "@/app/(dashboard)/admin/admin-workspace-shell";
import { AdminDashboardShell } from "@/components/prototype/admin-prototype-shell";
import {
  loadAdminShellPulseCounts,
  loadAdminTier1AlertCount,
} from "@/lib/dashboard/admin-dashboard-data";
import { loadAdminWorkspaceSummary } from "@/lib/dashboard/admin-workspace-summary";
import { getDashboardTheme } from "@/lib/dashboard-theme";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getCurrentUserTenants } from "@/lib/saas";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";

type LayoutParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  const { tenantSlug } = await params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=/${tenantSlug}/admin`);

  // ── Tenant resolution from URL slug ───────────────────────────────────────
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) {
    // Slug doesn't match any of this user's memberships.
    notFound();
  }

  // ── Capability gate ───────────────────────────────────────────────────────
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  // ── Shell data ────────────────────────────────────────────────────────────
  // These loaders call getTenantScope() internally (cookie/header-based).
  // For single-tenant users they correctly resolve to the same tenant.
  // Phase 3.x will add explicit tenantId overrides for multi-tenant switching.
  const [pulseCounts, tier1AlertCount, dashboardTheme, tenants, workspaceSummary] =
    await Promise.all([
      loadAdminShellPulseCounts(),
      loadAdminTier1AlertCount(),
      getDashboardTheme(session.supabase),
      getCurrentUserTenants(),
      loadAdminWorkspaceSummary(),
    ]);

  return (
    <>
      <Suspense
        fallback={
          <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--admin-workspace-bg)] text-[var(--admin-workspace-fg)]">
            <span className="text-sm text-[var(--admin-nav-idle)]">Loading…</span>
          </div>
        }
      >
        <AdminDashboardShell
          dashboardTheme={dashboardTheme}
          navBadges={{ inquiries: tier1AlertCount }}
          tenants={tenants}
          activeTenantId={scope.tenantId}
          workspace={workspaceSummary}
          userEmail={session.user.email ?? null}
        >
          <AdminWorkspaceShell pulseCounts={pulseCounts}>
            {children}
          </AdminWorkspaceShell>
        </AdminDashboardShell>
      </Suspense>
      <Toaster
        position="top-center"
        toastOptions={{
          className: "!rounded-xl !border-border/50 !shadow-lg",
        }}
      />
    </>
  );
}
