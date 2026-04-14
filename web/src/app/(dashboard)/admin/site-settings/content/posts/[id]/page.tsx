import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

import type { CmsRevisionListItem } from "../../cms-revision-actions";
import { CmsPostForm } from "../cms-post-form";
import type { CmsPostRow } from "../actions";

export const dynamic = "force-dynamic";

export default async function CmsPostEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  const { data, error } = await supabase.from("cms_posts").select("*").eq("id", id).maybeSingle();

  if (error) {
    logServerError("admin/cms-posts/edit", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }
  if (!data) notFound();

  let revisions: CmsRevisionListItem[] = [];
  const revRes = await supabase
    .from("cms_post_revisions")
    .select("id, kind, created_at, created_by")
    .eq("post_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!revRes.error && revRes.data) {
    revisions = revRes.data as CmsRevisionListItem[];
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Edit post</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href="/admin/site-settings/content/posts" className="text-primary hover:underline">
            ← All posts
          </Link>
        </p>
      </div>
      <DashboardSectionCard title={data.title} description="Update content and publishing status." titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <CmsPostForm initial={data as CmsPostRow} revisions={revisions} />
      </DashboardSectionCard>
    </div>
  );
}
