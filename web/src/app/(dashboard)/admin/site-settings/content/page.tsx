import Link from "next/link";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export default function SiteSettingsContentPage() {
  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Content"
        description="Standalone pages, posts, navigation menus, and URL redirects for your storefront."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          <li>
            <Link href="/admin/site-settings/content/pages" className="text-primary underline-offset-4 hover:underline">
              Pages
            </Link>{" "}
            — create and publish pages at <span className="font-mono">/p/…</span>.
          </li>
          <li>
            <Link
              href="/admin/site-settings/content/redirects"
              className="text-primary underline-offset-4 hover:underline"
            >
              Redirects
            </Link>{" "}
            — 301/302 rules applied before the page renders.
          </li>
          <li>
            <Link href="/admin/site-settings/content/posts" className="text-primary underline-offset-4 hover:underline">
              Posts
            </Link>{" "}
            — editorial entries at <span className="font-mono">/posts/…</span>.
          </li>
          <li>
            <Link
              href="/admin/site-settings/content/navigation"
              className="text-primary underline-offset-4 hover:underline"
            >
              Navigation
            </Link>{" "}
            — header and footer links per locale.
          </li>
        </ul>
      </DashboardSectionCard>
    </div>
  );
}
