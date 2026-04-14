import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export default function SiteSettingsSeoPage() {
  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="SEO & indexing"
        description="Per-page/post metadata, defaults, sitemap rules — docs/seo-governance.md."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <p className="text-sm text-muted-foreground">Placeholder for Phase 8.6A.</p>
      </DashboardSectionCard>
    </div>
  );
}
