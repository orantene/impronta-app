import Link from "next/link";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

import { CmsPageForm } from "../cms-page-form";

export const dynamic = "force-dynamic";

export default function NewCmsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>New page</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a CMS page. Publish when ready; public URL uses the slug below.
        </p>
      </div>
      <DashboardSectionCard title="Details" titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <CmsPageForm initial={null} revisions={[]} />
      </DashboardSectionCard>
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/site-settings/content/pages" className="text-primary underline-offset-4 hover:underline">
          ← All pages
        </Link>
      </p>
    </div>
  );
}
