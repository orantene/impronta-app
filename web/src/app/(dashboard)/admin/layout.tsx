import { Suspense } from "react";
import { Toaster } from "sonner";
import { redirect } from "next/navigation";
import { AdminWorkspaceShell } from "@/app/(dashboard)/admin/admin-workspace-shell";
import { AdminDashboardShell } from "@/components/prototype/admin-prototype-shell";
import {
  isStaffRole,
  resolveAuthenticatedDestination,
} from "@/lib/auth-flow";
import {
  loadAdminShellPulseCounts,
  loadAdminTier1AlertCount,
} from "@/lib/dashboard/admin-dashboard-data";
import { loadAdminWorkspaceSummary } from "@/lib/dashboard/admin-workspace-summary";
import { getDashboardTheme } from "@/lib/dashboard-theme";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getCurrentUserTenants, getTenantScope } from "@/lib/saas";
import { getPublicHostContext } from "@/lib/saas/scope";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Phase 3.12 / Phase 4 — branded admin shortcut.
  // impronta.tulala.digital/admin → /impronta/admin (subdomain)
  // improntamodels.com/admin     → /impronta/admin (custom domain)
  // Works for any agency host whose agency_domains row has tenant_slug set.
  const hostCtx = await getPublicHostContext();
  if (hostCtx.kind === "agency" && hostCtx.tenantSlug) {
    redirect(`/${hostCtx.tenantSlug}/admin`);
  }

  const session = await getCachedActorSession();
  if (!session.supabase) {
    redirect("/login?error=config");
  }
  if (!session.user) {
    redirect("/login");
  }

  const profile = session.profile;
  if (!isStaffRole(profile?.app_role)) {
    redirect(resolveAuthenticatedDestination(profile));
  }

  const [
    pulseCounts,
    tier1AlertCount,
    dashboardTheme,
    tenants,
    tenantScope,
    workspaceSummary,
  ] = await Promise.all([
    loadAdminShellPulseCounts(),
    loadAdminTier1AlertCount(),
    getDashboardTheme(session.supabase),
    getCurrentUserTenants(),
    getTenantScope(),
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
          activeTenantId={tenantScope?.tenantId ?? null}
          workspace={workspaceSummary}
          userEmail={session.user?.email ?? null}
        >
          <AdminWorkspaceShell pulseCounts={pulseCounts}>{children}</AdminWorkspaceShell>
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
