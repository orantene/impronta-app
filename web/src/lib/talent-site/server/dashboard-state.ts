import "server-only";

import {
  buildTalentMembershipState,
  type TalentMembershipState,
} from "@/lib/access/talent-membership";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  requireTalentSelf,
  requireTalentSelfScope,
} from "@/lib/server/talent-self-guard";
import { listTemplatesForTier } from "@/lib/talent-site/templates/registry";
import { provisionTalentPersonalSiteIfMissing } from "@/lib/talent-site/server/provision";
import type { TalentSiteDashboardState, TalentSiteRow } from "@/lib/talent-site/types";
import { parseTalentSiteSnapshot } from "@/lib/talent-site/validation";
import { assertTalentCanEditPersonalSite } from "@/lib/server/talent-self-guard";

function mapSiteRow(row: TalentSiteRow): TalentSiteDashboardState["site"] {
  const draftSnapshot = parseTalentSiteSnapshot(row.draft_snapshot);
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    draftUpdatedAt: row.draft_updated_at,
    publishedAt: row.published_at,
    unpublishedAt: row.unpublished_at,
    hasPublishedSnapshot: row.published_snapshot != null,
    planLocked: row.plan_locked ?? false,
    pendingTemplateReset: row.pending_template_reset ?? false,
    draftSnapshot,
  };
}

export async function loadTalentPersonalSiteDashboardState(
  tenantSlug?: string,
): Promise<
  | { ok: true; state: TalentSiteDashboardState }
  | { ok: false; code: string; error: string }
> {
  const scope = tenantSlug
    ? await requireTalentSelfScope(tenantSlug)
    : await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }

  const membership: TalentMembershipState = buildTalentMembershipState(scope.planKey);
  const profileCode = scope.talentProfile.profileCode;

  const admin = createServiceRoleClient();
  let site: TalentSiteDashboardState["site"] = null;
  let templateKey: string | null = null;
  let compositionMode: TalentSiteDashboardState["compositionMode"] = null;

  if (admin && assertTalentCanEditPersonalSite(scope.planKey) && profileCode) {
    await provisionTalentPersonalSiteIfMissing(
      scope.talentProfile.id,
      scope.planKey,
      scope.session.user.id,
    );
  }

  if (admin) {
    const { data } = await admin
      .from("talent_sites")
      .select(
        "id, talent_profile_id, site_kind, status, draft_snapshot, published_snapshot, version, draft_updated_at, published_at, unpublished_at, plan_locked, pending_template_reset, created_by, updated_by, created_at, updated_at",
      )
      .eq("talent_profile_id", scope.talentProfile.id)
      .maybeSingle();

    if (data) {
      const row = data as unknown as TalentSiteRow;
      const draft = parseTalentSiteSnapshot(row.draft_snapshot);
      if (draft) {
        row.draft_snapshot = draft;
        templateKey = draft.templateKey;
        compositionMode = draft.compositionMode;
      }
      if (row.published_snapshot) {
        const published = parseTalentSiteSnapshot(row.published_snapshot);
        if (published) {
          row.published_snapshot = published;
        }
      }
      site = mapSiteRow(row);
    }
  }

  const availableTemplates = listTemplatesForTier(membership.tier).map((t) => ({
    key: t.key,
    label: t.label,
    blurb: t.blurb,
    thumbnailUrl: t.thumbnailUrl,
  }));

  const state: TalentSiteDashboardState = {
    planKey: membership.planKey,
    tier: membership.tier,
    displayName: membership.displayName,
    canBuildPersonalSite: membership.capabilities.canUseCustomBuilder,
    canEditPersonalSite: membership.capabilities.canEditPersonalSite,
    canPublishPersonalSite: membership.capabilities.canPublishPersonalSite,
    canUseTemplateGallery: membership.capabilities.canUseTemplateGallery,
    canUseCustomBuilder: membership.capabilities.canUseCustomBuilder,
    profileCode,
    publicSiteUrl: profileCode ? `/t/${profileCode}` : null,
    publicProfileUrl: profileCode ? `/t/${profileCode}` : null,
    isPubliclyHidden: scope.talentProfile.isPubliclyHidden,
    templateKey,
    compositionMode,
    availableTemplates,
    site,
  };

  return { ok: true, state };
}
