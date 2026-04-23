import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export default function SiteSettingsAuditPage() {
  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Audit"
        description="Change history for branding, design tokens, sections, pages, and publish events across your storefront."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            A searchable audit timeline is coming to this tab
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            In the meantime, every save on Identity, Branding, Design, Sections,
            and Structure writes an audit + revision row in the database, and
            per-surface restore is available from each editor.
          </p>
        </div>
      </DashboardSectionCard>
    </div>
  );
}
