import { Suspense } from "react";
import { Shield } from "lucide-react";
import { AdminUserEditButton } from "@/app/(dashboard)/admin/users/admin-user-edit-button";
import { Badge } from "@/components/ui/badge";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { TalentPageHeader } from "@/components/talent/talent-dashboard-primitives";
import { loadAdminStaffRows } from "@/lib/dashboard/admin-dashboard-data";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW_INTERACTIVE,
  ADMIN_TABLE_TH,
  ADMIN_TABLE_WRAP,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export default async function AdminStaffListPage() {
  const rows = await loadAdminStaffRows();

  return (
    <div className={ADMIN_PAGE_STACK}>
      <TalentPageHeader
        icon={Shield}
        title="Admins & staff"
        description="Agency staff and super-admins. Password reset and sign-in history live in Supabase Auth (dashboard), not in this table."
      />

      <DashboardSectionCard
        title="Staff accounts"
        description="Edit opens the account sheet (role, status, linked talent). Use Supabase Auth for password reset until a built-in flow ships."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff accounts found.</p>
        ) : (
          <Suspense
            fallback={
              <div className="h-48 animate-pulse rounded-2xl border border-border/40 bg-muted/20" aria-hidden />
            }
          >
            <div className={ADMIN_TABLE_WRAP}>
            <table className="w-full border-collapse text-sm">
              <thead className={ADMIN_TABLE_HEAD}>
                <tr className="border-b border-border/45 text-left">
                  <th className={ADMIN_TABLE_TH}>Name</th>
                  <th className={cn("hidden md:table-cell", ADMIN_TABLE_TH)}>Role</th>
                  <th className={cn("hidden lg:table-cell", ADMIN_TABLE_TH)}>Permissions</th>
                  <th className={cn("hidden lg:table-cell", ADMIN_TABLE_TH)}>Last activity</th>
                  <th className={ADMIN_TABLE_TH}>Status</th>
                  <th className={ADMIN_TABLE_TH}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/25">
                {rows.map((row) => (
                  <tr key={row.user_id} className={ADMIN_TABLE_ROW_INTERACTIVE}>
                    <td className="px-4 py-3.5">
                      <p className="font-display text-[15px] font-medium text-foreground">
                        {row.display_name ?? "Unnamed"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{row.user_id}</p>
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      <Badge variant="outline" className="border-border/45 capitalize">
                        {(row.app_role ?? "").replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="hidden max-w-[220px] px-4 py-3.5 text-xs text-muted-foreground lg:table-cell">
                      {row.permissions.length > 0 ? row.permissions.join(", ") : "Default staff access"}
                    </td>
                    <td className="hidden px-4 py-3.5 text-xs text-muted-foreground lg:table-cell">
                      {new Date(row.updated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="secondary" className="border border-border/40 capitalize">
                        {row.account_status ?? "active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <AdminUserEditButton
                        userId={row.user_id}
                        urlSync={{ pathname: "/admin/users/admins" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Suspense>
        )}
      </DashboardSectionCard>
    </div>
  );
}
