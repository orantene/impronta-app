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
} from "@/lib/dashboard/admin-dashboard-data";
import { getDashboardTheme } from "@/lib/dashboard-theme";
import { getCachedActorSession } from "@/lib/server/request-cache";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  const pulseCounts = await loadAdminShellPulseCounts();
  const dashboardTheme = await getDashboardTheme(session.supabase);

  return (
    <>
      <Suspense
        fallback={
          <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--admin-workspace-bg)] text-[var(--admin-workspace-fg)]">
            <span className="text-sm text-[var(--admin-nav-idle)]">Loading…</span>
          </div>
        }
      >
        <AdminDashboardShell dashboardTheme={dashboardTheme}>
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
