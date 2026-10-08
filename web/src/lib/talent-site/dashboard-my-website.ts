/**
 * TUL-180 Option A — dashboard "My website" primary target.
 *
 * For dual owners (business workspace site + personal talent site), the
 * primary surface is the business workspace. Personal stays findable under
 * Website settings → Other websites (`?site=personal`). Pure so UI + tests
 * share one rule.
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
};

export function resolveTalentDashboardMyWebsite(
  state: Pick<
    TalentSiteDashboardState,
    "publicSiteUrl" | "personalPublicSiteUrl" | "workspaceSite" | "site" | "profileCode"
  >,
): DashboardMyWebsite {
  const workspace = state.workspaceSite;
  if (workspace) {
    return {
      kind: "workspace",
      publicUrl: workspace.publicUrl,
      editHref: workspace.adminHref || workspaceSiteBuilderHref(workspace.slug),
      personalStatus: null,
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
    };
  }

  return {
    kind: "create",
    publicUrl: state.publicSiteUrl,
    editHref: CREATE_WEBSITE_HREF,
    personalStatus: null,
  };
}
