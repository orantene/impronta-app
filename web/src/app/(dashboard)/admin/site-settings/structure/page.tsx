import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import {
  DEFAULT_PLATFORM_LOCALE,
  hasPhase5Capability,
  homepageTemplate,
  type Locale,
} from "@/lib/site-admin";
import { ensureHomepageRow, loadHomepageForStaff } from "@/lib/site-admin/server/homepage";
import { loadHomepageRevisionsForStaff } from "@/lib/site-admin/server/homepage-reads";
import { listSectionsForStaff } from "@/lib/site-admin/server/sections-reads";
import { SECTION_REGISTRY } from "@/lib/site-admin/sections/registry";
import { getTenantPreviewOrigin } from "@/lib/site-admin/server/tenant-hosts";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { HomepageComposer } from "./homepage-composer";
import { LivePreviewPanel } from "./live-preview-panel";

export const dynamic = "force-dynamic";

/**
 * Phase 5 / M5 — homepage composer route.
 *
 * Flow:
 *   1. Guard staff + tenant scope.
 *   2. If the operator has `homepage.compose`, call `ensureHomepageRow` so
 *      the cms_pages row exists (idempotent seed-on-first-visit).
 *   3. Load: homepage page + draft/live slot rows, published sections list,
 *      revision history.
 *   4. Hand everything to a client composer component.
 *
 * Locale handling for M5: the composer operates on the default platform
 * locale (`en`). A locale switcher lands in a follow-up — the row model is
 * already per-locale via the `cms_pages_system_lookup_idx` partial unique.
 */
export default async function SiteSettingsStructurePage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Homepage"
          description="Select an agency workspace to edit the homepage."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Use the workspace switcher in the admin header to pick a tenant.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const [canCompose, canPublish] = await Promise.all([
    hasPhase5Capability("agency.site_admin.homepage.compose", scope.tenantId),
    hasPhase5Capability("agency.site_admin.homepage.publish", scope.tenantId),
  ]);

  if (!canCompose && !canPublish) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Homepage"
          description="You don't have permission to compose or publish the homepage on this workspace. Ask an admin for the editor or coordinator role."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Homepage edits require the editor role or higher.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const locale: Locale = DEFAULT_PLATFORM_LOCALE;

  // Seed the homepage row on first visit. If the caller can compose, the
  // ensureHomepageRow op itself gates on the same capability; otherwise we
  // fall back to a plain load and render a read-only view.
  if (canCompose) {
    const ensure = await ensureHomepageRow(auth.supabase, {
      tenantId: scope.tenantId,
      locale,
      actorProfileId: auth.user.id,
    });
    if (!ensure.ok) {
      return (
        <div className="space-y-4">
          <DashboardSectionCard
            title="Homepage"
            description="We hit an error seeding the homepage row. Try again; if this persists, contact support."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {ensure.message ?? ensure.code}
            </p>
          </DashboardSectionCard>
        </div>
      );
    }
  }

  const state = await loadHomepageForStaff(auth.supabase, scope.tenantId, locale);
  if (!state) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Homepage"
          description="Homepage not initialised yet. Your first visit as an editor seeds a draft row automatically; reload to try again."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            No homepage row exists for this workspace. Check that an editor
            has opened this page at least once.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const [sections, revisions, previewOrigin] = await Promise.all([
    listSectionsForStaff(auth.supabase, scope.tenantId),
    loadHomepageRevisionsForStaff(auth.supabase, scope.tenantId, state.page.id),
    getTenantPreviewOrigin(auth.supabase, scope.tenantId),
  ]);

  const isEmptyTenant =
    state.draftSlots.length === 0 &&
    state.liveSlots.length === 0 &&
    sections.length === 0;

  return (
    <div className="space-y-4">
      {isEmptyTenant && canCompose && (
        <DashboardSectionCard
          title="Welcome — let's set up your homepage"
          description="You don't have any sections yet. Every slot below has an Add from library button that creates a section with sensible defaults — pick one and start composing."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                title: "1. Pick a theme",
                body:
                  "Visit Design → Theme preset to choose a look. Editorial Bridal is a good starting point for premium storefronts.",
                href: "/admin/site-settings/design",
                cta: "Open Design",
              },
              {
                title: "2. Add a hero",
                body:
                  "In the Hero slot below, click + Add from library → Hero. You'll land in an editor with real-looking placeholder copy.",
                href: null,
                cta: null,
              },
              {
                title: "3. Compose + publish",
                body:
                  "Keep adding sections (trust band, featured talent, gallery, CTA…), save the draft, and hit Publish when you're ready.",
                href: null,
                cta: null,
              },
            ].map((step) => (
              <div
                key={step.title}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 p-4"
              >
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="flex-1 text-xs text-muted-foreground">
                  {step.body}
                </p>
                {step.href && step.cta ? (
                  <a
                    href={step.href}
                    className="inline-flex w-fit items-center rounded-md border border-foreground/30 bg-foreground/10 px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/20"
                  >
                    {step.cta}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </DashboardSectionCard>
      )}

      {previewOrigin && (
        <DashboardSectionCard
          title="Live preview"
          description="Inline view of your published storefront. Reload after you publish to see changes."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <LivePreviewPanel
            origin={previewOrigin}
            path="/"
            lastPublishedAt={state.page.published_at ?? null}
          />
        </DashboardSectionCard>
      )}

      <DashboardSectionCard
        title="Homepage"
        description="Compose the storefront homepage from published reusable sections. Draft saves don't affect the live site; publishing promotes the draft composition and freezes section content into the published snapshot."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <HomepageComposer
          locale={locale}
          page={state.page}
          draftSlots={state.draftSlots}
          liveSlots={state.liveSlots}
          availableSections={sections.map((s) => ({
            id: s.id,
            name: s.name,
            sectionTypeKey: s.section_type_key,
            status: s.status,
            updatedAt: s.updated_at,
          }))}
          template={{
            currentVersion: homepageTemplate.currentVersion,
            slots: homepageTemplate.meta.slots.map((slot) => ({
              key: slot.key,
              label: slot.label,
              required: slot.required,
              allowedSectionTypes: slot.allowedSectionTypes ?? null,
            })),
          }}
          revisions={revisions.map((r) => ({
            id: r.id,
            kind: r.kind,
            version: r.version,
            createdAt: r.created_at,
          }))}
          sectionRegistry={Object.values(SECTION_REGISTRY).map((entry) => ({
            key: entry.meta.key,
            label: entry.meta.label,
            description: entry.meta.description,
            businessPurpose: entry.meta.businessPurpose,
            visibleToAgency: entry.meta.visibleToAgency,
          }))}
          canCompose={canCompose}
          canPublish={canPublish}
        />
      </DashboardSectionCard>
    </div>
  );
}
