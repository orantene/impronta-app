import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import {
  hasPhase5Capability,
  listAgencyConfigurableTokens,
  resolveDesignTokens,
  tokenDefaults,
} from "@/lib/site-admin";
import {
  loadDesignForStaff,
  loadDesignRevisionsForStaff,
} from "@/lib/site-admin/server/design";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { DesignEditor } from "./design-editor";

export const dynamic = "force-dynamic";

/**
 * Phase 5 / M6 — design tokens route.
 *
 * Flow:
 *   1. Guard staff + tenant scope.
 *   2. Resolve `design.edit` + `design.publish` capabilities (both are
 *      admin-only in the default matrix, but kept as separate grants so
 *      the matrix can differentiate later without a code change).
 *   3. Load the branding row via the staff (uncached) reader, so the draft
 *      values are always fresh — no cache barrier between a recent save and
 *      the operator's next open.
 *   4. Merge registry defaults + live tokens for the "Live value" column
 *      and the fallback when a token key is missing entirely (e.g. first
 *      visit before anyone has saved a draft).
 *   5. Hand the capability flags, registry, draft/live values, version, and
 *      revision list to the client editor.
 */
export default async function SiteSettingsDesignPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Design tokens"
          description="Select an agency workspace to edit design tokens."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Use the workspace switcher in the admin header to pick a tenant.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const [canEdit, canPublish] = await Promise.all([
    hasPhase5Capability("agency.site_admin.design.edit", scope.tenantId),
    hasPhase5Capability("agency.site_admin.design.publish", scope.tenantId),
  ]);

  if (!canEdit && !canPublish) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Design tokens"
          description="You don't have permission to edit or publish design tokens on this workspace."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Design edits require the admin role.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const row = await loadDesignForStaff(auth.supabase, scope.tenantId);
  if (!row) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Design tokens"
          description="Branding row missing. Initialise branding before editing design tokens."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Open the Branding page and save once to seed the row, then return
            here.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const revisions = await loadDesignRevisionsForStaff(
    auth.supabase,
    scope.tenantId,
    50,
  );

  // Resolve defaults once and use them to backfill both columns for tokens
  // the operator hasn't touched yet. resolveDesignTokens() already applies
  // the layering; we feed it each column individually so the UI labels are
  // explicit ("this is the DRAFT value vs this is the LIVE value").
  const defaults = tokenDefaults();
  const draftMerged = resolveDesignTokens({
    theme_json: row.theme_json_draft,
  });
  const liveMerged = resolveDesignTokens({ theme_json: row.theme_json });

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Design tokens"
        description="Govern storefront colours, type presets and radius. Changes land as a draft; publish promotes them to the live storefront."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <DesignEditor
          tokens={listAgencyConfigurableTokens()}
          draftValues={draftMerged}
          liveValues={liveMerged}
          defaults={defaults}
          version={row.version}
          themePublishedAt={row.theme_published_at}
          revisions={revisions.map((r) => ({
            id: r.id,
            kind: r.kind,
            version: r.version,
            createdAt: r.created_at,
          }))}
          canEdit={canEdit}
          canPublish={canPublish}
        />
      </DashboardSectionCard>
    </div>
  );
}
