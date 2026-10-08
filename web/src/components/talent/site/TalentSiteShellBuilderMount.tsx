"use client";

/**
 * TalentSiteShellBuilderMount — mounts the ONE Page Builder Core for a Talent
 * Max SITE SHELL (the header/logo/nav + footer rendered around every page).
 *
 * Mirrors `TalentMaxBuilderMount` but binds the TALENT-site shell adapter
 * (`createBoundTalentSiteShellAdapter`) over the shared `site_shell` builder
 * config (`buildSiteShellBuilderConfig`, which sets `canEditShell: true`). The
 * editor persists to `talent_sites.shell_tree` (draft) and publishes by baking
 * `shell_tree → shell_published`. NEVER writes `cms_pages` / `cms_page_sections`.
 *
 * The adapter keys every op off `talentProfileId` (threaded as `ctx.pageId`).
 * Owner + Max gating is server-enforced inside the bound actions + by
 * `talent_sites` RLS.
 */

import { useMemo } from "react";

import { FirstPaintTipBottomProvider } from "@/components/edit-chrome/first-paint-tip-context";
import { TalentAiTranslateProvider } from "@/components/locale-field/talent-ai-context";
import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildSiteShellBuilderConfig } from "@/lib/site-admin/builder-core/config";
import { createBoundTalentSiteShellAdapter } from "@/lib/site-admin/builder-core/adapters/talent-site-shell-adapter";
import { BuilderMediaScopeProvider } from "@/components/edit-chrome/builder-media-scope";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";
import type { TalentSiteCapabilities } from "@/lib/access/talent-membership";

export interface TalentSiteShellBuilderMountProps {
  /** The `talent_profiles.id` — threaded as `ctx.pageId` to the shell adapter. */
  talentProfileId: string;
  /** The workspace (agency) tenant id — builder scope / credentials. */
  tenantId: string;
  /** Workspace plan tier — passed through for gallery gating. */
  workspacePlan?: string | null;
  /** Display label for the topbar (e.g. talent's display name). */
  talentDisplayName?: string | null;
  /**
   * Phase 1 — the talent's per-capability record, threaded into
   * `buildSiteShellBuilderConfig`. Omitted ⇒ every capability true (the
   * legacy behaviour — a talent shell was Max-only).
   */
  siteCapabilities?: TalentSiteCapabilities;
  /** Locale. */
  locale?: string;
  /** Called when the user clicks "Exit" in the editor chrome. */
  onExit?: () => void;
  /** The site's pages — powers the in-editor page switcher. */
  sitePages?: MaxSiteManagerPage[];
  /** PR 7: talent languages -> builder defaultLocale / availableLocales. */
  talentLocales?: { primary: string; secondary: readonly string[] };
}

export function TalentSiteShellBuilderMount({
  talentProfileId,
  tenantId,
  workspacePlan = null,
  talentDisplayName = null,
  siteCapabilities,
  locale,
  onExit,
  sitePages,
  talentLocales,
}: TalentSiteShellBuilderMountProps) {
  const surfaceConfig = useMemo(
    () =>
      buildSiteShellBuilderConfig(
        createBoundTalentSiteShellAdapter(talentProfileId),
        // X4 — this mount IS the talent Max-site shell, so declare a talent tier:
        // it makes `buildSiteShellBuilderConfig` resolve the precise overlay
        // surface to `talent_shell` (its OWN catalog toggle), no longer riding the
        // workspace toggle. The site's actual tier now comes through
        // `siteCapabilities` (Phase 1); the talentTier flag itself only needs to
        // be non-null to mark this shell as talent-owned.
        { talentTier: "talent_portfolio", siteCapabilities },
      ),
    [talentProfileId, siteCapabilities],
  );

  return (
    <BuilderMediaScopeProvider talentProfileId={talentProfileId}>
      <div data-talent-shell-builder-mount>
      {/* No exit chip / page switcher over the canvas: the builder top bar owns
          exit, and talents have a single page. */}
        <TalentAiTranslateProvider>
<FirstPaintTipBottomProvider>
        <BuilderEditorMount
          surfaceConfig={surfaceConfig}
          tenantId={tenantId}
          workspacePlan={workspacePlan}
          locale={locale}
          defaultLocale={talentLocales?.primary}
          availableLocales={talentLocales ? [talentLocales.primary, ...talentLocales.secondary] : undefined}
          // The bound shell adapter captures `talentProfileId` in its closure, so
          // the shell surface needs no pageSlug — every op keys off that id.
          tenantSiteLabel={
            talentDisplayName
              ? `${talentDisplayName} — site shell`
              : "Site shell"
          }
          canInsertRawHtmlElements={false}
          headerVariant={onExit ? "lab" : "live"}
          onExit={onExit}
        />
        </FirstPaintTipBottomProvider>
</TalentAiTranslateProvider>
      </div>
    </BuilderMediaScopeProvider>
  );
}
