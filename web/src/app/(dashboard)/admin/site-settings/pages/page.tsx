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
          <div className="mt-4 rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-[var(--impronta-gold)]/[0.04] via-card/30 to-muted/10 p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]">
              <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden>
                <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">No pages yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Pages are standalone tenant-authored surfaces — About, Services,
              a legal page, a journal. Drafts stay private until you publish.
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground/80">
              The homepage lives in Composer — it ships with your workspace
              and is edited there.
            </p>
            {canEdit && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/admin/site-settings/pages/new"
                  className="inline-flex items-center rounded-xl bg-[var(--impronta-gold)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--impronta-gold)]/92"
                >
                  Create first page
                </Link>
                <a
                  href="/?edit=1"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center rounded-xl border border-border/60 bg-background/70 px-4 py-2 text-sm text-muted-foreground transition hover:border-[var(--impronta-gold)]/40 hover:text-foreground"
                >
                  Open editor →
                </a>
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
                            title="System-owned pages are edited from the Structure tab."
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
