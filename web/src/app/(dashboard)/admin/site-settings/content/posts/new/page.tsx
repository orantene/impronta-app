import Link from "next/link";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

import { CmsPostForm } from "../cms-post-form";

export default function CmsPostNewPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>New post</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href="/admin/site-settings/content/posts" className="text-primary hover:underline">
            ← All posts
          </Link>
        </p>
      </div>
      <DashboardSectionCard title="Post" description="Single-segment slug (e.g. summer-campaign)." titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <CmsPostForm initial={null} revisions={[]} />
      </DashboardSectionCard>
    </div>
  );
}
