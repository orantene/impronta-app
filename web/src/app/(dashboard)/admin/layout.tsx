import { Toaster } from "sonner";
import { redirect } from "next/navigation";
import { AdminWorkspaceShell } from "@/app/(dashboard)/admin/admin-workspace-shell";
import {
  isStaffRole,
  resolveAuthenticatedDestination,
} from "@/lib/auth-flow";
import {
  loadAdminShellPulseCounts,
} from "@/lib/dashboard/admin-dashboard-data";
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

  return (
    <>
      <AdminWorkspaceShell pulseCounts={pulseCounts}>{children}</AdminWorkspaceShell>
      <Toaster
        position="top-center"
        toastOptions={{
          className: "!rounded-xl !border-border/50 !shadow-lg",
        }}
      />
    </>
  );
}
