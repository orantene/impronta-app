import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export default function SiteSettingsSeoPage() {
  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="SEO & indexing"
        description="Search engine metadata, sitemap rules, and social-card previews for your storefront."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            Per-page SEO overrides are coming to this tab
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            For now, default title, description, and social-card fields are
            managed under{" "}
            <Link
              href="/admin/site-settings/identity"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Identity
            </Link>
            , and each page can override them from its own editor once it&apos;s
            created in{" "}
            <Link
              href="/admin/site-settings/pages"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Pages
            </Link>
            .
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/admin/site-settings/identity"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-[var(--impronta-gold-border)]/55"
            >
              Open Identity
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </DashboardSectionCard>
    </div>
  );
}
