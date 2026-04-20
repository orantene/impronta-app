import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { requireAdminTenantGuard } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

import type { CmsRevisionListItem } from "../../cms-revision-actions";
import { CmsPageForm } from "../cms-page-form";
import type { CmsPageRow } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditCmsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, tenantId } = await requireAdminTenantGuard();

  const { data, error } = await supabase
    .from("cms_pages")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    logServerError("admin/cms-pages/edit", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }
  if (!data) notFound();

  const row = data as CmsPageRow;

  let revisions: CmsRevisionListItem[] = [];
  const revRes = await supabase
    .from("cms_page_revisions")
    .select("id, kind, created_at, created_by")
    .eq("page_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!revRes.error && revRes.data) {
    revisions = revRes.data as CmsRevisionListItem[];
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Edit page</h2>
        <p className="mt-1 text-sm text-muted-foreground font-mono">{row.slug}</p>
      </div>
      <DashboardSectionCard title="Details" titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <CmsPageForm initial={row} revisions={revisions} />
      </DashboardSectionCard>
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/site-settings/content/pages" className="text-primary underline-offset-4 hover:underline">
          ← All pages
        </Link>
      </p>
    </div>
  );
}
