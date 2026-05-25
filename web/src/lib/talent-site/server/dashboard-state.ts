import "server-only";

import {
  buildTalentMembershipState,
  type TalentMembershipState,
} from "@/lib/access/talent-membership";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireTalentSelfScope } from "@/lib/server/talent-self-guard";
import type { TalentSiteDashboardState, TalentSiteRow } from "@/lib/talent-site/types";
import { parseTalentSiteSnapshot } from "@/lib/talent-site/validation";

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
    draftSnapshot,
  };
}

export async function loadTalentPersonalSiteDashboardState(
  tenantSlug: string,
): Promise<
  | { ok: true; state: TalentSiteDashboardState }
  | { ok: false; code: string; error: string }
> {
  const scope = await requireTalentSelfScope(tenantSlug);
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }

  const membership: TalentMembershipState = buildTalentMembershipState(scope.planKey);
  const profileCode = scope.talentProfile.profileCode;

  const admin = createServiceRoleClient();
  let site: TalentSiteDashboardState["site"] = null;

  if (admin) {
    const { data } = await admin
      .from("talent_sites")
      .select(
        "id, talent_profile_id, site_kind, status, draft_snapshot, published_snapshot, version, draft_updated_at, published_at, unpublished_at, created_by, updated_by, created_at, updated_at",
      )
      .eq("talent_profile_id", scope.talentProfile.id)
      .maybeSingle();

    if (data) {
      const row = data as unknown as TalentSiteRow;
      const draft = parseTalentSiteSnapshot(row.draft_snapshot);
      if (draft) {
        row.draft_snapshot = draft;
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

  const state: TalentSiteDashboardState = {
    planKey: membership.planKey,
    tier: membership.tier,
    displayName: membership.displayName,
    canBuildPersonalSite: membership.capabilities.canBuildPersonalSite,
    canEditPersonalSite: membership.capabilities.canEditPersonalSite,
    canPublishPersonalSite: membership.capabilities.canPublishPersonalSite,
    profileCode,
    publicSiteUrl: profileCode ? `/t/${profileCode}/site` : null,
    publicProfileUrl: profileCode ? `/t/${profileCode}` : null,
    site,
  };

  return { ok: true, state };
}
