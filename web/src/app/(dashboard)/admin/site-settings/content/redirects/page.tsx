import Link from "next/link";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { requireAdminTenantGuard } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

import { CmsRedirectsClient } from "./cms-redirects-client";

export const dynamic = "force-dynamic";

export default async function CmsRedirectsPage() {
  const { supabase, tenantId } = await requireAdminTenantGuard();

  const { data, error } = await supabase
    .from("cms_redirects")
    .select("id,old_path,new_path,status_code,active,updated_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) {
    logServerError("admin/cms-redirects/list", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className={ADMIN_SECTION_TITLE_CLASS}>Redirects</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Active redirects are applied on incoming requests before the page renders.
        </p>
      </div>
      <DashboardSectionCard title="Rules" description="301/302 from old path to new path." titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <CmsRedirectsClient initial={data ?? []} />
      </DashboardSectionCard>
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/site-settings/content/pages" className="text-primary underline-offset-4 hover:underline">
          ← Pages
        </Link>
        {" · "}
        <Link href="/admin/site-settings/content" className="text-primary underline-offset-4 hover:underline">
          Content hub
        </Link>
      </p>
    </div>
  );
}
