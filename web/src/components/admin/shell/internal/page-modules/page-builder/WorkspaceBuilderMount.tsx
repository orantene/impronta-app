"use client";

/**
 * WorkspaceBuilderMount (WS6) — mounts the ONE Page Builder Core in the
 * workspace admin for a specific workspace_pages row.
 *
 * This replaces the old block-list `PageBuilderPage` editor for a single page
 * when the admin selects it. It uses the WS1 `BuilderEditorMount` and the WS6
 * `workspace_page` adapter with the `workspace` preview subject.
 *
 * Pattern copied from `builder-lab-stage.tsx` (WS5), adapted for the
 * workspace_page surface:
 *   1. Build a `BuilderContextConfig` with `buildWorkspacePageBuilderConfig`.
 *   2. Drop in `<BuilderEditorMount surfaceConfig={config} …>`.
 *   3. The editor mounts with the workspace adapter persisting to
 *      `workspace_pages.blocks` — NEVER to `cms_page_sections`.
 *
 * Gallery (WS4): `galleryPolicy.allowDbTemplates = true` + `"page_templates"`
 * tab are on, filtered server-side by `target_context = "workspace"` + the
 * workspace's plan tier (§E).
 */

import { useMemo } from "react";

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildWorkspacePageBuilderConfig } from "@/lib/site-admin/builder-core/config";
import { createBoundWorkspacePageAdapter } from "@/lib/site-admin/builder-core/adapters/workspace-page-adapter";

export interface WorkspaceBuilderMountProps {
  /** The `agencies.id` (tenant id) — threaded as `ctx.pageId` to the adapter. */
  tenantId: string;
  /** The workspace page slug being edited — threaded as `ctx.pageSlug`. */
  pageSlug: string;
  /** Workspace plan tier (free|studio|agency|network) — gates gallery items. */
  workspacePlan?: string | null;
  /** Workspace display name — shown in the topbar. */
  tenantSiteLabel?: string | null;
  /** Workspace admin URL segment — for the topbar exit link. */
  workspaceMembershipSlug?: string | null;
  /** Locale. */
  locale?: string;
}

export function WorkspaceBuilderMount({
  tenantId,
  pageSlug,
  workspacePlan = null,
  tenantSiteLabel = null,
  workspaceMembershipSlug = null,
  locale,
}: WorkspaceBuilderMountProps) {
  // Create a per-mount adapter with tenantId in closure, then build config.
  // useMemo(tenantId) ensures a new adapter is created if tenant ever changes
  // (shouldn't happen in practice, but defensive).
  const surfaceConfig = useMemo(
    () => buildWorkspacePageBuilderConfig(createBoundWorkspacePageAdapter(tenantId)),
    [tenantId],
  );

  return (
    <div data-workspace-builder-mount>
      <BuilderEditorMount
        surfaceConfig={surfaceConfig}
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        // pageSlug = the workspace_pages.slug being edited.
        // tenantId is captured in the adapter's closure (not passed via ctx.pageId).
        pageSlug={pageSlug}
        tenantSiteLabel={tenantSiteLabel ?? "Workspace page builder"}
        workspaceMembershipSlug={workspaceMembershipSlug}
        canInsertRawHtmlElements={false}
      />
    </div>
  );
}
