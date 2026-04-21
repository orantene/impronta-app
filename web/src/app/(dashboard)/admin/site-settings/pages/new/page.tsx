import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { PageEditor } from "../page-editor";

export const dynamic = "force-dynamic";

export default async function NewPageRoute() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin");

  const [canEdit, canPublish, locales] = await Promise.all([
    hasPhase5Capability("agency.site_admin.pages.edit", scope.tenantId),
    hasPhase5Capability("agency.site_admin.pages.publish", scope.tenantId),
    loadTenantLocaleSettings(scope.tenantId),
  ]);

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="New page"
          description="You do not have permission to create pages on this workspace."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Ask a workspace admin to grant you editor access.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="New page"
        description="Create a draft page. It stays private until you publish."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <PageEditor
          mode="create"
          page={null}
          canEdit={canEdit}
          canPublish={canPublish}
          supportedLocales={locales.supportedLocales}
          defaultLocale={locales.defaultLocale}
        />
      </DashboardSectionCard>
    </div>
  );
}
