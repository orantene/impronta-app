/**
 * TUL-371 / TUL-180 Option A — dashboard "My website" / live-pill primary target.
 *
 * For dual owners (business workspace site + personal talent site), the
 * primary surface is the business workspace. Personal stays findable under
 * Website settings → Other websites (`?site=personal`). Pure so UI + tests
 * share one rule.
 *
 * Live vs draft: a workspace with only draft cms_pages is still the edit
 * target, but it is NOT "Sitio en vivo" — that requires a published page
 * (or the personal reward path). See `isTalentDashboardWebsiteLive`.
 */

import {
  CREATE_WEBSITE_HREF,
  PERSONAL_BUILDER_HREF,
  workspaceSiteBuilderHref,
} from "@/lib/talent-site/my-website-target";
import type { TalentSiteDashboardState, TalentSiteStatus } from "@/lib/talent-site/types";

export const PERSONAL_SITE_BUILDER_HREF = `${PERSONAL_BUILDER_HREF}?site=personal`;

export type DashboardMyWebsiteKind = "workspace" | "personal" | "hub" | "create";

export type DashboardMyWebsite = {
  kind: DashboardMyWebsiteKind;
  /** Public URL to open in a new tab (absolute or root-relative). */
  publicUrl: string | null;
  /** In-app editor href. */
  editHref: string;
  /** talent_sites status when primary is personal; null for workspace/hub/create. */
  personalStatus: TalentSiteStatus | null;
  /**
   * When kind is workspace: true only if cms has a published page.
   * False for draft-only (edit href still points at the workspace).
   */
  workspacePublished: boolean;
};

export function resolveTalentDashboardMyWebsite(
  state: Pick<
    TalentSiteDashboardState,
    "publicSiteUrl" | "personalPublicSiteUrl" | "workspaceSite" | "site" | "profileCode"
  >,
): DashboardMyWebsite {
  const workspace = state.workspaceSite;
  if (workspace) {
    const published = workspace.isPublished === true;
    return {
      kind: "workspace",
      // Draft-only: keep edit href, withhold public URL so the live pill
      // cannot open an unpublished host (falls back to personal / hub).
      publicUrl: published ? workspace.publicUrl : null,
      editHref: workspace.adminHref || workspaceSiteBuilderHref(workspace.slug),
      personalStatus: null,
      workspacePublished: published,
    };
  }

  if (state.site) {
    const isHubOnly =
      Boolean(state.publicSiteUrl) &&
      !state.personalPublicSiteUrl &&
      Boolean(state.profileCode) &&
      (state.publicSiteUrl === `/t/${state.profileCode}` ||
        state.publicSiteUrl?.endsWith(`/t/${state.profileCode}`));
    return {
      kind: isHubOnly ? "hub" : "personal",
      publicUrl: state.publicSiteUrl,
      editHref: PERSONAL_BUILDER_HREF,
      personalStatus: state.site.status,
      workspacePublished: false,
    };
  }

  return {
    kind: "create",
    publicUrl: state.publicSiteUrl,
    editHref: CREATE_WEBSITE_HREF,
    personalStatus: null,
    workspacePublished: false,
  };
}

/**
 * Hoy "Sitio en vivo" / live pill. Workspace counts as live only when
 * published; otherwise `reward === "published"` (personal) is the source of truth.
 */
export function isTalentDashboardWebsiteLive(
  reward: string,
  myWebsite: Pick<DashboardMyWebsite, "kind" | "workspacePublished"> | null,
): boolean {
  if (myWebsite?.kind === "workspace" && myWebsite.workspacePublished) return true;
  return reward === "published";
}
