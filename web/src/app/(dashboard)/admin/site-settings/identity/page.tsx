import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import { loadIdentityForStaff } from "@/lib/site-admin/server/reads";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { IdentityForm } from "./identity-form";

export const dynamic = "force-dynamic";

export default async function SiteSettingsIdentityPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Identity"
          description="Select an agency workspace to edit site identity."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Use the workspace switcher in the admin header to pick a tenant.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const canEdit = await hasPhase5Capability(
    "agency.site_admin.identity.edit",
    scope.tenantId,
  );

  const row = await loadIdentityForStaff(auth.supabase, scope.tenantId);

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Identity"
        description="Public name, contact info, localization, site defaults. Edits publish immediately; every save writes an audit + revision row."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <IdentityForm
          canEdit={canEdit}
          tenantId={scope.tenantId}
          row={row}
        />
      </DashboardSectionCard>
    </div>
  );
}
