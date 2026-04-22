import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import {
  loadSectionByIdForStaff,
  loadSectionRevisionsForStaff,
  loadSectionUsageForStaff,
} from "@/lib/site-admin/server/sections-reads";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { DuplicateSectionButton } from "../duplicate-section-button";
import { SectionEditor } from "../section-editor";
import { SectionRevisionHistory } from "./revision-history";

export const dynamic = "force-dynamic";

export default async function EditSectionRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin");

  const { id } = await params;

  const [canEdit, canPublish, section, revisions, usage] = await Promise.all([
    hasPhase5Capability("agency.site_admin.sections.edit", scope.tenantId),
    hasPhase5Capability("agency.site_admin.sections.publish", scope.tenantId),
    loadSectionByIdForStaff(auth.supabase, scope.tenantId, id),
    loadSectionRevisionsForStaff(auth.supabase, scope.tenantId, id),
    loadSectionUsageForStaff(auth.supabase, scope.tenantId, id),
  ]);

  if (!section) notFound();

  const registryEntry = getSectionType(section.section_type_key);
  const typeLabel =
    registryEntry?.meta.label ?? section.section_type_key;

  // Distinct referencing pages (draft + live collapsed to one per page).
  const distinctPages = new Map(
    usage.pageRefs.map((r) => [r.pageId, r] as const),
  );

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title={section.name}
        description={`Edit this ${typeLabel} section. Changes stay draft until you publish; the storefront serves the last published version until then.`}
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {/* ---- usage block ---- */}
        <div className="mb-4 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          {usage.totalReferences === 0 ? (
            <p className="text-muted-foreground">
              <strong>In use:</strong> not yet referenced by any page. You
              can delete it freely while it stays unused.
            </p>
          ) : (
            <div className="space-y-1">
              <p>
                <strong>In use by {distinctPages.size} page
                {distinctPages.size === 1 ? "" : "s"}</strong>
                {usage.usedByHomepage && " (including the homepage)"}. Delete
                is blocked while any of these references exist — archive is
                the reversible alternative.
              </p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {[...distinctPages.values()].map((ref) => (
                  <li key={ref.pageId}>
                    {ref.isHomepage ? (
                      <span>Homepage ({ref.pageTitle})</span>
                    ) : (
                      <span>
                        {ref.pageTitle}
                        {ref.pageSlug ? ` (/${ref.pageSlug})` : ""}
                      </span>
                    )}
                    {ref.isDraftComposition && (
                      <span className="ml-2 rounded border border-border/60 bg-muted/40 px-1 py-0.5 text-[10px] uppercase tracking-wide">
                        draft composition
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mb-2 flex items-center justify-end gap-2">
          {canEdit && (
            <DuplicateSectionButton
              sourceId={section.id}
              sourceName={section.name}
            />
          )}
          <Link
            href="/admin/site-settings/sections"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Back to list
          </Link>
        </div>

        <SectionEditor
          mode="edit"
          section={section}
          canEdit={canEdit}
          canPublish={canPublish}
          sectionInUse={usage.totalReferences > 0}
          tenantId={scope.tenantId}
        />
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Revision history"
        description="Restore a previous draft or published snapshot. Restored revisions land as draft."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <SectionRevisionHistory
          sectionId={section.id}
          currentVersion={section.version}
          revisions={revisions}
          canEdit={canEdit}
        />
      </DashboardSectionCard>
    </div>
  );
}
