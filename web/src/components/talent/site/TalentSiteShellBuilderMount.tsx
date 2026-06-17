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

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildSiteShellBuilderConfig } from "@/lib/site-admin/builder-core/config";
import { createBoundTalentSiteShellAdapter } from "@/lib/site-admin/builder-core/adapters/talent-site-shell-adapter";
import { CHROME } from "@/components/edit-chrome/kit/tokens";
import { BuilderMediaScopeProvider } from "@/components/edit-chrome/builder-media-scope";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";
import { TalentBuilderPageSwitcher } from "./TalentBuilderPageSwitcher";

export interface TalentSiteShellBuilderMountProps {
  /** The `talent_profiles.id` — threaded as `ctx.pageId` to the shell adapter. */
  talentProfileId: string;
  /** The workspace (agency) tenant id — builder scope / credentials. */
  tenantId: string;
  /** Workspace plan tier — passed through for gallery gating. */
  workspacePlan?: string | null;
  /** Display label for the topbar (e.g. talent's display name). */
  talentDisplayName?: string | null;
  /** Locale. */
  locale?: string;
  /** Called when the user clicks "Exit" in the editor chrome. */
  onExit?: () => void;
  /** The site's pages — powers the in-editor page switcher. */
  sitePages?: MaxSiteManagerPage[];
}

export function TalentSiteShellBuilderMount({
  talentProfileId,
  tenantId,
  workspacePlan = null,
  talentDisplayName = null,
  locale,
  onExit,
  sitePages,
}: TalentSiteShellBuilderMountProps) {
  const surfaceConfig = useMemo(
    () => buildSiteShellBuilderConfig(createBoundTalentSiteShellAdapter(talentProfileId)),
    [talentProfileId],
  );

  return (
    <BuilderMediaScopeProvider talentProfileId={talentProfileId}>
      <div data-talent-shell-builder-mount>
        {onExit && (
          <div
            data-talent-shell-exit-bar
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
              <TalentBuilderPageSwitcher pages={sitePages} currentSlug="__shell__" />
            ) : (
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
                Site shell — header &amp; footer
              </span>
            )}
          </div>
        )}

        <BuilderEditorMount
          surfaceConfig={surfaceConfig}
          tenantId={tenantId}
          workspacePlan={workspacePlan}
          locale={locale}
          // The bound shell adapter captures `talentProfileId` in its closure, so
          // the shell surface needs no pageSlug — every op keys off that id.
          tenantSiteLabel={
            talentDisplayName
              ? `${talentDisplayName} — site shell`
              : "Site shell"
          }
          canInsertRawHtmlElements={false}
        />
      </div>
    </BuilderMediaScopeProvider>
  );
}
