import { notFound, redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import {
  loadPageByIdForStaff,
  loadPageRevisionsForStaff,
} from "@/lib/site-admin/server/pages-reads";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { PageEditor } from "../page-editor";
import { RevisionHistory } from "./revision-history";

export const dynamic = "force-dynamic";

export default async function EditPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin");

  const { id } = await params;

  const [canEdit, canPublish, locales, page, revisions] = await Promise.all([
    hasPhase5Capability("agency.site_admin.pages.edit", scope.tenantId),
    hasPhase5Capability("agency.site_admin.pages.publish", scope.tenantId),
    loadTenantLocaleSettings(scope.tenantId),
    loadPageByIdForStaff(auth.supabase, scope.tenantId, id),
    loadPageRevisionsForStaff(auth.supabase, scope.tenantId, id),
  ]);

  if (!page) notFound();

  // System-owned pages (homepage) route through the Homepage tab (M5).
  // Surface a locked view here so operators who bookmark this URL aren't
  // silently dropped onto an edit form that would reject every save.
  if (page.is_system_owned) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title={page.title}
          description="This page is system-owned. Use the Structure tab to compose the homepage — slug, locale, and template are locked here."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            System pages are seeded by the platform and cannot be deleted.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title={page.title}
        description={`Edit draft content for /${page.slug} (${page.locale.toUpperCase()}).`}
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <PageEditor
          mode="edit"
          page={page}
          canEdit={canEdit}
          canPublish={canPublish}
          supportedLocales={locales.supportedLocales}
          defaultLocale={locales.defaultLocale}
        />
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Revision history"
        description="Restore a previous draft or published snapshot. Restored revisions land as draft."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <RevisionHistory
          pageId={page.id}
          currentVersion={page.version}
          revisions={revisions}
          canEdit={canEdit}
        />
      </DashboardSectionCard>
    </div>
  );
}
