import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  PageStatusBadge,
  SystemOwnedBadge,
} from "@/components/admin/page-status-badge";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import { listPagesForStaff } from "@/lib/site-admin/server/pages-reads";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

export const dynamic = "force-dynamic";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function SiteSettingsPagesIndexPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Pages"
          description="Select an agency workspace to manage pages."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Use the workspace switcher in the admin header to pick a tenant.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const [canEdit, rows] = await Promise.all([
    hasPhase5Capability("agency.site_admin.pages.edit", scope.tenantId),
    listPagesForStaff(auth.supabase, scope.tenantId),
  ]);

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Pages"
        description="CMS page list. Drafts are private; publishing pushes a page to the storefront. Pages are sorted by most recently updated first."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Start by creating your first page."
              : `${rows.length} page${rows.length === 1 ? "" : "s"}`}
          </p>
          {canEdit && (
            <Link
              href="/admin/site-settings/pages/new"
              className="rounded-md border border-foreground/40 bg-foreground/10 px-3 py-1.5 text-sm transition hover:bg-foreground/20"
            >
              New page
            </Link>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-border/60 bg-muted/10 p-8 text-center">
            <p className="text-sm font-medium">No pages yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first page — About, Services, a legal page, anything
              tenant-authored. Drafts stay private until you publish.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The homepage is managed separately — it ships with your
              workspace and is edited in the Homepage tab (arriving in M5).
            </p>
            {canEdit && (
              <div className="mt-4">
                <Link
                  href="/admin/site-settings/pages/new"
                  className="inline-flex items-center rounded-md border border-foreground/40 bg-foreground/10 px-3 py-1.5 text-sm transition hover:bg-foreground/20"
                >
                  Create first page
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Locale</th>
                  <th className="px-3 py-2">Template</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last updated</th>
                  <th className="px-3 py-2">Last published</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSystem = row.is_system_owned;
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-border/40 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{row.title}</span>
                          {isSystem && <SystemOwnedBadge />}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        /{row.slug || <em>homepage</em>}
                      </td>
                      <td className="px-3 py-2 uppercase">{row.locale}</td>
                      <td className="px-3 py-2 text-xs">{row.template_key}</td>
                      <td className="px-3 py-2">
                        <PageStatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatWhen(row.updated_at)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatWhen(row.published_at)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isSystem ? (
                          <span
                            className="text-xs text-muted-foreground"
                            title="System-owned pages are managed in the Homepage tab (M5)."
                          >
                            locked
                          </span>
                        ) : (
                          <Link
                            href={`/admin/site-settings/pages/${row.id}`}
                            className="text-xs text-foreground underline-offset-2 hover:underline"
                          >
                            Edit
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardSectionCard>
    </div>
  );
}
