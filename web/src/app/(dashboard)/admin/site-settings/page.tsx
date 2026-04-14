import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export default function SiteSettingsOverviewPage() {
  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Phase 8.6 roadmap"
        description="This hub groups future CMS tools. Operational toggles stay under Admin → Settings; talent/directory data stays under Directory / Talent Data."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          <li>
            <code className="text-xs">docs/site-settings-model.md</code> — IA and permission matrix.
          </li>
          <li>
            Content (pages, posts, featured, nav, redirects) — migrations + UI per <strong>Phase 8.6A</strong>.
          </li>
          <li>
            System (theme tokens, audit visibility, fine-grained flags) — <strong>Phase 8.6B</strong>.
          </li>
        </ul>
      </DashboardSectionCard>
    </div>
  );
}
