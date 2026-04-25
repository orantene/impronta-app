import { Suspense } from "react";
import { Search, Shield, Users } from "lucide-react";

import { AdminUserEditButton } from "@/app/(dashboard)/admin/users/admin-user-edit-button";
import { AdminGlobalUserSearchClient } from "@/app/(dashboard)/admin/users/admin-global-user-search-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminResponsiveTable,
  type AdminResponsiveTableColumn,
} from "@/components/admin/admin-responsive-table";
import { DashboardPersonInline } from "@/components/dashboard/dashboard-person-inline";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { Badge } from "@/components/ui/badge";
import {
  loadAdminStaffRows,
  loadTaxonomyTalentTypesForFilters,
  type AdminStaffRow,
} from "@/lib/dashboard/admin-dashboard-data";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";

export const dynamic = "force-dynamic";

/**
 * Phase 17 — Users consolidation.
 *
 * Replaces /admin/users/admins + /admin/users/search with a single page
 * that surfaces both (Admins & staff up top, global directory search
 * below). Same components, same data — just one route.
 */

const STAFF_COLUMNS: AdminResponsiveTableColumn<AdminStaffRow>[] = [
  {
    id: "name",
    label: "Name",
    priority: "high",
    cell: (row) => (
      <DashboardPersonInline
        avatarUrl={row.avatar_url}
        name={row.display_name}
        avatarSize="md"
        align="center"
      >
        <p className="font-display text-[15px] font-medium text-foreground">
          {row.display_name ?? "Unnamed"}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {row.user_id}
        </p>
      </DashboardPersonInline>
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
        {row.permissions.length > 0
          ? row.permissions.join(", ")
          : "Default staff access"}
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
      <span className="text-xs text-muted-foreground">
        {new Date(row.updated_at).toLocaleString()}
      </span>
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
      <AdminUserEditButton
        userId={row.user_id}
        urlSync={{ pathname: "/admin/users" }}
      />
    ),
  },
];

export default async function AdminUsersPage() {
  const [staffRows, talentTypes] = await Promise.all([
    loadAdminStaffRows(),
    loadTaxonomyTalentTypesForFilters(),
  ]);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Users}
        title="Users"
        description="Agency staff up top; global directory search below — talent, clients, and staff in one filterable list."
      />

      <DashboardSectionCard
        title={
          <span className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" aria-hidden />
            Admins & staff
          </span>
        }
        description="Edit opens the account sheet (role, status, linked talent). Use Supabase Auth for password reset until a built-in flow ships."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {staffRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff accounts found.</p>
        ) : (
          <Suspense
            fallback={
              <div
                className="h-48 animate-pulse rounded-2xl border border-border/40 bg-muted/20"
                aria-hidden
              />
            }
          >
            <AdminResponsiveTable
              aria-label="Staff accounts"
              columns={STAFF_COLUMNS}
              rows={staffRows}
              getRowKey={(r) => r.user_id}
            />
          </Suspense>
        )}
      </DashboardSectionCard>

      <DashboardSectionCard
        title={
          <span className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            Global directory search
          </span>
        }
        description="Search across talent, clients, and staff. Combine text with role, account status, location, and taxonomy filters."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AdminGlobalUserSearchClient talentTypes={talentTypes} />
      </DashboardSectionCard>
    </div>
  );
}
