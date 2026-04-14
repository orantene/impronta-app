import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import Link from "next/link";

export default function SiteSettingsSystemPage() {
  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="System"
        description="Global snippets, theme tokens (documented keys only), feature flags — extend Admin → Settings where keys already live."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <p className="text-sm text-muted-foreground">
          Use{" "}
          <Link href="/admin/settings" className="text-primary underline-offset-4 hover:underline">
            Admin → Settings
          </Link>{" "}
          for <code className="text-xs">public.settings</code> today (directory, inquiries, AI flags, theme).
        </p>
      </DashboardSectionCard>
    </div>
  );
}
