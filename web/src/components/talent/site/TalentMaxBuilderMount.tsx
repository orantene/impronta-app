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

import { useEffect, useMemo, useRef } from "react";

import { FirstPaintTipBottomProvider } from "@/components/edit-chrome/first-paint-tip-context";
import { TalentAiTranslateProvider } from "@/components/locale-field/talent-ai-context";
import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildTalentPageBuilderConfig } from "@/lib/site-admin/builder-core/config";
import { createBoundTalentPageAdapter } from "@/lib/site-admin/builder-core/adapters/talent-page-adapter";
import { TALENT_LOCKED_OPERATION_EVENT } from "@/components/edit-chrome/talent-lock-broadcast";
import { BuilderMediaScopeProvider } from "@/components/edit-chrome/builder-media-scope";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import type { CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";
import type { TalentSiteCapabilities } from "@/lib/access/talent-membership";

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
  /**
   * Phase 1 — the talent's per-capability record. Threaded into
   * `buildTalentPageBuilderConfig` so `structuralEdits`/`themeTokens`/`seo`
   * map from the ACTUAL capability record instead of a Max-or-not guess.
   * Omitted ⇒ the config factory falls back to its legacy `talentTier` rule
   * (byte-identical to today).
   */
  siteCapabilities?: TalentSiteCapabilities;
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
  /** Server-primed page composition (the route reads the talent_pages row
   *  once). When present the editor opens on it instead of a client load. */
  initialComposition?: CompositionData | null;
  /**
   * The site's pages — when provided, the exit bar renders the multi-page
   * switcher (switch page / add page / jump to shell or manager). Omitted on the
   * legacy single-page entry, which keeps the plain display-name chip.
   */
  sitePages?: MaxSiteManagerPage[];
  /** PR 7: talent languages -> builder defaultLocale / availableLocales. */
  talentLocales?: { primary: string; secondary: readonly string[] };
}

export function TalentMaxBuilderMount({
  talentProfileId,
  pageSlug,
  tenantId,
  talentTier = null,
  siteCapabilities,
  workspacePlan = null,
  talentDisplayName = null,
  locale,
  canvasRenderData = null,
  initialComposition = null,
  sitePages,
  talentLocales,
}: TalentMaxBuilderMountProps) {
  // Create a per-mount adapter with talentProfileId in closure.
  // Config rebuilds on talentProfileId, tier or capability record change.
  const surfaceConfig = useMemo(
    () =>
      buildTalentPageBuilderConfig(
        createBoundTalentPageAdapter(talentProfileId),
        { talentTier, siteCapabilities },
      ),
    [talentProfileId, talentTier, siteCapabilities],
  );

  // Phase 1 stopgap — the real Phase 4 upgrade dialog isn't shipped yet, so a
  // sections-lock refusal would otherwise leave the talent with the denial
  // toast and no path forward. Until that dialog exists, route to the plan
  // card on Settings instead of leaving the event unheard. `navigatedRef`
  // stops a second denial (e.g. a repeated click while the toast is still up)
  // from firing a second navigation.
  const navigatedRef = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onLocked = () => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      // Give the existing denial toast a moment on screen before leaving.
      // A HARD navigation: this route renders without the dashboard shell and
      // a soft push keeps that bare layout, so the shell-only settings page
      // would mount with no AdminShellProvider (the 2026-10-01 crash).
      timer = setTimeout(() => window.location.assign("/talent/settings"), 1200);
    };
    window.addEventListener(TALENT_LOCKED_OPERATION_EVENT, onLocked);
    return () => {
      window.removeEventListener(TALENT_LOCKED_OPERATION_EVENT, onLocked);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <BuilderMediaScopeProvider talentProfileId={talentProfileId}>
    <div data-talent-max-builder-mount>
      {/* No exit chip / page switcher over the canvas: the builder top bar owns
          exit, and talents have a single page. */}
      <TalentAiTranslateProvider>
<FirstPaintTipBottomProvider>
      <BuilderEditorMount
        surfaceConfig={surfaceConfig}
        // tenantId = the workspace/agency managing this talent (builder scope)
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        defaultLocale={talentLocales?.primary}
        availableLocales={talentLocales ? [talentLocales.primary, ...talentLocales.secondary] : undefined}
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
        initialComposition={initialComposition}
      />
      </FirstPaintTipBottomProvider>
</TalentAiTranslateProvider>
    </div>
    </BuilderMediaScopeProvider>
  );
}
