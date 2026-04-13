import { Toaster } from "sonner";
import { AdminWorkspaceShell } from "@/app/(dashboard)/admin/admin-workspace-shell";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";
import { loadAdminOverviewData } from "@/lib/dashboard/admin-dashboard-data";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  if (!supabase) {
    return <div className={ADMIN_PAGE_STACK}>{children}</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <div className={ADMIN_PAGE_STACK}>{children}</div>;
  }

  const profile = await loadAccessProfile(supabase, user.id);
  if (!isStaffRole(profile?.app_role)) {
    return <div className={ADMIN_PAGE_STACK}>{children}</div>;
  }

  const overview = await loadAdminOverviewData();
  const pulseCounts = overview
    ? {
        totalTalent: overview.counts.totalTalent,
        pendingTalent: overview.counts.pendingTalent,
        openInquiries: overview.counts.openInquiries,
        pendingMedia: overview.counts.pendingMedia,
        totalClients: overview.counts.totalClients,
      }
    : null;

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
