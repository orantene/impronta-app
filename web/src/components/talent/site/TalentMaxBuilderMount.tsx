"use client";

/**
 * TalentMaxBuilderMount (WS6) — mounts the ONE Page Builder Core for a
 * Talent Max (talent_portfolio / Max tier) freeform page.
 *
 * Pattern copied from `builder-lab-stage.tsx` (WS5), adapted for the
 * talent_page surface:
 *   1. Build a `BuilderContextConfig` with `buildTalentPageBuilderConfig`.
 *   2. Drop in `<BuilderEditorMount surfaceConfig={config} …>`.
 *   3. The editor persists to `talent_pages.blocks` via the talent_page adapter.
 *      NEVER writes `cms_page_sections`.
 *
 * Plan/tier gating (§E):
 *   - This component should only be rendered when the talent's tier meets
 *     or exceeds the page's `required_talent_tier` (checked by the calling
 *     surface / TalentSiteDashboardClient before mounting this).
 *   - The adapter's RLS enforces the same constraint at the DB level.
 *
 * Gallery (WS4): `galleryPolicy.allowDbTemplates = true` + `"page_templates"`
 * tab on, filtered server-side by `target_context = "talent"` + `required_talent_tier`
 * matching the talent's tier (§E).
 */

import { useMemo } from "react";

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildTalentPageBuilderConfig } from "@/lib/site-admin/builder-core/config";
import { createBoundTalentPageAdapter } from "@/lib/site-admin/builder-core/adapters/talent-page-adapter";
import { CHROME } from "@/components/edit-chrome/kit/tokens";
import { BuilderMediaScopeProvider } from "@/components/edit-chrome/builder-media-scope";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";
import { TalentBuilderPageSwitcher } from "./TalentBuilderPageSwitcher";

export interface TalentMaxBuilderMountProps {
  /**
   * The `talent_profiles.id` for this talent — threaded as `ctx.pageId` to the
   * adapter. This is NOT the profile code; it is the uuid primary key.
   */
  talentProfileId: string;
  /** The `talent_pages.slug` being edited — threaded as `ctx.pageSlug`. */
  pageSlug: string;
  /**
   * The workspace (agency) tenant id — used for builder credentials + scope
   * inside `EditShell`. This is the agency that manages this talent.
   */
  tenantId: string;
  /** Talent tier (talent_basic | talent_pro | talent_portfolio). */
  talentTier?: string | null;
  /** Workspace plan tier — passed through to the editor for gallery gating. */
  workspacePlan?: string | null;
  /** Display label for the topbar (e.g. talent's display name). */
  talentDisplayName?: string | null;
  /** Locale. */
  locale?: string;
  /** Called when the user clicks "Exit" in the editor chrome. */
  onExit?: () => void;
  /** Server-assembled in-editor canvas render data (data sources + islands). */
  canvasRenderData?: InEditorCanvasRenderData | null;
  /**
   * The site's pages — when provided, the exit bar renders the multi-page
   * switcher (switch page / add page / jump to shell or manager). Omitted on the
   * legacy single-page entry, which keeps the plain display-name chip.
   */
  sitePages?: MaxSiteManagerPage[];
}

export function TalentMaxBuilderMount({
  talentProfileId,
  pageSlug,
  tenantId,
  talentTier = null,
  workspacePlan = null,
  talentDisplayName = null,
  locale,
  onExit,
  canvasRenderData = null,
  sitePages,
}: TalentMaxBuilderMountProps) {
  // Create a per-mount adapter with talentProfileId in closure.
  // Config rebuilds on talentProfileId or tier change.
  const surfaceConfig = useMemo(
    () =>
      buildTalentPageBuilderConfig(
        createBoundTalentPageAdapter(talentProfileId),
        { talentTier },
      ),
    [talentProfileId, talentTier],
  );

  return (
    <BuilderMediaScopeProvider talentProfileId={talentProfileId}>
    <div data-talent-max-builder-mount>
      {onExit && (
        <div
          data-talent-builder-exit-bar
          style={{
            position: "sticky",
            top: 50,
            zIndex: 41,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            background: CHROME.paper,
            borderBottom: `1px solid ${CHROME.line}`,
          }}
        >
          <button
            type="button"
            onClick={onExit}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 8,
              border: `1px solid ${CHROME.controlBorder}`,
              background: CHROME.controlFill,
              color: CHROME.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← Exit editor
          </button>
          {sitePages ? (
            <TalentBuilderPageSwitcher pages={sitePages} currentSlug={pageSlug} />
          ) : (
            talentDisplayName && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: CHROME.greenBg,
                  color: CHROME.green,
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: CHROME.green,
                  }}
                />
                {talentDisplayName}
              </span>
            )
          )}
        </div>
      )}

      <BuilderEditorMount
        surfaceConfig={surfaceConfig}
        // tenantId = the workspace/agency managing this talent (builder scope)
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        // pageId carries talentProfileId on talent_page surfaces (adapter contract)
        // pageSlug carries the talent_pages.slug
        pageSlug={pageSlug}
        tenantSiteLabel={
          talentDisplayName
            ? `${talentDisplayName} — page builder`
            : "Talent page builder"
        }
        canInsertRawHtmlElements={false}
        canvasRenderData={canvasRenderData}
      />
    </div>
    </BuilderMediaScopeProvider>
  );
}
