import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { SectionStatusBadge } from "@/components/admin/section-status-badge";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import {
  listSectionsForStaff,
  loadSectionUsageMapForStaff,
  type SectionUsage,
} from "@/lib/site-admin/server/sections-reads";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { DuplicateSectionButton } from "./duplicate-section-button";

export const dynamic = "force-dynamic";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Condense a SectionUsage row into one short human label for the list table.
 *   - "Not in use"            — zero refs
 *   - "Homepage"              — homepage only
 *   - "Homepage + 2 pages"    — homepage + N others
 *   - "3 pages"               — N non-homepage refs
 * Distinct page ids are counted (dupe rows within a page count once).
 */
function formatUsageSummary(usage: SectionUsage | undefined): string {
  if (!usage || usage.totalReferences === 0) return "Not in use";
  const distinctPageIds = new Set(usage.pageRefs.map((r) => r.pageId));
  const nonHomepageCount = [...distinctPageIds].filter(
    (id) => !usage.pageRefs.find((r) => r.pageId === id)?.isHomepage,
  ).length;
  if (usage.usedByHomepage && nonHomepageCount === 0) return "Homepage";
  if (usage.usedByHomepage) {
    return `Homepage + ${nonHomepageCount} page${nonHomepageCount === 1 ? "" : "s"}`;
  }
  return `${nonHomepageCount} page${nonHomepageCount === 1 ? "" : "s"}`;
}

/**
 * Tooltip hint: lists up to 4 page titles so the operator can trace a
 * non-zero usage count. Draft vs live is marked inline because both block
 * a hard delete.
 */
function formatUsageTooltip(usage: SectionUsage | undefined): string | undefined {
  if (!usage || usage.totalReferences === 0) return undefined;
  const byPage = new Map<
    string,
    { title: string; isHomepage: boolean; anyDraft: boolean }
  >();
  for (const ref of usage.pageRefs) {
    const entry = byPage.get(ref.pageId);
    if (entry) {
      entry.anyDraft = entry.anyDraft || ref.isDraftComposition;
    } else {
      byPage.set(ref.pageId, {
        title: ref.isHomepage ? `${ref.pageTitle} (homepage)` : ref.pageTitle,
        isHomepage: ref.isHomepage,
        anyDraft: ref.isDraftComposition,
      });
    }
  }
  const labels = [...byPage.values()]
    .slice(0, 4)
    .map((e) => `${e.title}${e.anyDraft ? " [draft comp.]" : ""}`);
  const extra = byPage.size > 4 ? ` (+${byPage.size - 4} more)` : "";
  return `Referenced by: ${labels.join(", ")}${extra}`;
}

export default async function SiteSettingsSectionsIndexPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Sections"
          description="Select an agency workspace to manage reusable sections."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Use the workspace switcher in the admin header to pick a tenant.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const [canEdit, rows, usageMap] = await Promise.all([
    hasPhase5Capability("agency.site_admin.sections.edit", scope.tenantId),
    listSectionsForStaff(auth.supabase, scope.tenantId),
    loadSectionUsageMapForStaff(auth.supabase, scope.tenantId),
  ]);

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Sections"
        description="Reusable content blocks (hero, feature, footer) composed onto the homepage and other pages. Drafts are private; publishing pushes the section shape to every storefront surface that references it. Sorted by most recently updated first."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Start by creating your first reusable section."
              : `${rows.length} section${rows.length === 1 ? "" : "s"}`}
          </p>
          {canEdit && (
            <Link
              href="/admin/site-settings/sections/new"
              className="rounded-md border border-foreground/40 bg-foreground/10 px-3 py-1.5 text-sm transition hover:bg-foreground/20"
            >
              New section
            </Link>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-[var(--impronta-gold)]/[0.04] via-card/30 to-muted/10 p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]">
              <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden>
                <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">No sections yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Sections are reusable content blocks — a hero, a feature list,
              a CTA banner. Once published, they compose onto the homepage
              and other pages without re-authoring copy anywhere.
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground/80">
              Drafts stay private until you publish. <strong>Archive</strong>{" "}
              pauses without deleting. <strong>Delete</strong> is blocked
              while any page references the section.
            </p>
            {canEdit && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/admin/site-settings/sections/new"
                  className="inline-flex items-center rounded-xl bg-[var(--impronta-gold)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--impronta-gold)]/92"
                >
                  Create first section
                </Link>
                <a
                  href="/admin/site-settings/structure"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center rounded-xl border border-border/60 bg-background/70 px-4 py-2 text-sm text-muted-foreground transition hover:border-[var(--impronta-gold)]/40 hover:text-foreground"
                >
                  Or build from the live canvas →
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Used by</th>
                  <th className="px-3 py-2">Needs attention</th>
                  <th className="px-3 py-2">Last updated</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const registry = getSectionType(row.section_type_key);
                  const typeLabel =
                    registry?.meta.label ?? row.section_type_key;
                  const usage = usageMap.get(row.id);
                  const usageLabel = formatUsageSummary(usage);
                  const usageTooltip = formatUsageTooltip(usage);
                  const schemaOutdated =
                    registry && registry.currentVersion !== row.schema_version;
                  const schemaDriftLabel = schemaOutdated
                    ? "Update available"
                    : "—";
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-border/40 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-xs">{typeLabel}</td>
                      <td className="px-3 py-2">
                        <SectionStatusBadge status={row.status} />
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-muted-foreground"
                        title={usageTooltip}
                      >
                        {usageLabel}
                      </td>
                      <td
                        className={`px-3 py-2 text-xs ${
                          schemaOutdated
                            ? "text-amber-300"
                            : "text-muted-foreground"
                        }`}
                        title={
                          schemaOutdated
                            ? "The section template has been updated. Open and save this section to migrate it forward — a short re-author may be needed before publishing."
                            : undefined
                        }
                      >
                        {schemaDriftLabel}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatWhen(row.updated_at)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <DuplicateSectionButton
                              sourceId={row.id}
                              sourceName={row.name}
                            />
                          )}
                          <Link
                            href={`/admin/site-settings/sections/${row.id}`}
                            className="text-xs text-foreground underline-offset-2 hover:underline"
                          >
                            Edit
                          </Link>
                        </div>
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
