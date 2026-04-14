import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export default function SiteSettingsAuditPage() {
  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Audit"
        description="Change history for CMS and critical settings — docs/audit-events.md."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <p className="text-sm text-muted-foreground">Placeholder for Phase 8.6B.</p>
      </DashboardSectionCard>
    </div>
  );
}
