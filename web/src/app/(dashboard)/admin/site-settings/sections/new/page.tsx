import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import { listAgencyVisibleSections } from "@/lib/site-admin/sections/registry";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { SectionEditor } from "../section-editor";

export const dynamic = "force-dynamic";

/**
 * New section — M4 ships the hero type only, so the picker collapses to a
 * single-option dropdown today. As more types register (M6+), this route
 * fans them out grouped by `businessPurpose`.
 *
 * Query param `?type=<key>` selects the initial type; missing falls back
 * to the first agency-visible type in the registry.
 */
export default async function NewSectionRoute({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin");

  const [canEdit, canPublish] = await Promise.all([
    hasPhase5Capability("agency.site_admin.sections.edit", scope.tenantId),
    hasPhase5Capability("agency.site_admin.sections.publish", scope.tenantId),
  ]);

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="New section"
          description="You do not have permission to create sections on this workspace."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Ask a workspace admin to grant you editor access.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const visible = listAgencyVisibleSections();
  const { type } = await searchParams;
  const selectedType =
    (type && visible.find((v) => v.meta.key === type)?.meta.key) ??
    visible[0]?.meta.key;

  if (!selectedType) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="New section"
          description="No section types are available on this platform build."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            The platform registry is empty. Contact support.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="New section"
        description="Create a reusable content block. It stays a draft until you publish."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <SectionEditor
          mode="create"
          section={null}
          initialTypeKey={selectedType as "hero"}
          canEdit={canEdit}
          canPublish={canPublish}
        />
      </DashboardSectionCard>
    </div>
  );
}
