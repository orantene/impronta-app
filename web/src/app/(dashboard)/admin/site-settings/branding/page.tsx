import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import { loadBrandingForStaff } from "@/lib/site-admin/server/reads";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { BrandingForm } from "./branding-form";

export const dynamic = "force-dynamic";

export default async function SiteSettingsBrandingPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Branding"
          description="Select an agency workspace to edit branding."
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
    "agency.site_admin.branding.edit",
    scope.tenantId,
  );

  const row = await loadBrandingForStaff(auth.supabase, scope.tenantId);

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Branding"
        description="Logo, favicon, colors, and typography. These values flow through every storefront surface — header, footer, email, social cards. Advanced design tokens live under Design."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <BrandingForm canEdit={canEdit} row={row} />
      </DashboardSectionCard>
    </div>
  );
}
