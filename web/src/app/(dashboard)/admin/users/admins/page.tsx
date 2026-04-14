import { Suspense } from "react";
import { Shield } from "lucide-react";
import { AdminUserEditButton } from "@/app/(dashboard)/admin/users/admin-user-edit-button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminResponsiveTable,
  type AdminResponsiveTableColumn,
} from "@/components/admin/admin-responsive-table";
import { Badge } from "@/components/ui/badge";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { loadAdminStaffRows, type AdminStaffRow } from "@/lib/dashboard/admin-dashboard-data";
import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

const staffColumns: AdminResponsiveTableColumn<AdminStaffRow>[] = [
  {
    id: "name",
    label: "Name",
    priority: "high",
    cell: (row) => (
      <div>
        <p className="font-display text-[15px] font-medium text-foreground">
          {row.display_name ?? "Unnamed"}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{row.user_id}</p>
      </div>
    ),
  },
  {
    id: "role",
    label: "Role",
    priority: "low",
    headerClassName: "hidden md:table-cell",
    cellClassName: "hidden md:table-cell",
    cell: (row) => (
      <Badge variant="outline" className="border-border/45 capitalize">
        {(row.app_role ?? "").replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    id: "permissions",
    label: "Permissions",
    priority: "low",
    headerClassName: "hidden lg:table-cell",
    cellClassName: "hidden max-w-[220px] lg:table-cell",
    cell: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.permissions.length > 0 ? row.permissions.join(", ") : "Default staff access"}
      </span>
    ),
  },
  {
    id: "activity",
    label: "Last activity",
    priority: "low",
    headerClassName: "hidden lg:table-cell",
    cellClassName: "hidden lg:table-cell",
    cell: (row) => (
      <span className="text-xs text-muted-foreground">{new Date(row.updated_at).toLocaleString()}</span>
    ),
  },
  {
    id: "status",
    label: "Status",
    priority: "high",
    cell: (row) => (
      <Badge variant="secondary" className="border border-border/40 capitalize">
        {row.account_status ?? "active"}
      </Badge>
    ),
  },
  {
    id: "actions",
    label: "Actions",
    priority: "high",
    cell: (row) => (
      <AdminUserEditButton userId={row.user_id} urlSync={{ pathname: "/admin/users/admins" }} />
    ),
  },
];

export default async function AdminStaffListPage() {
  const rows = await loadAdminStaffRows();

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
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
            <AdminResponsiveTable
              aria-label="Staff accounts"
              columns={staffColumns}
              rows={rows}
              getRowKey={(r) => r.user_id}
            />
          </Suspense>
        )}
      </DashboardSectionCard>
    </div>
  );
}
