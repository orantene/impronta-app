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
import { shouldAutoCreatePersonalSite } from "@/lib/talent-site/my-website-target";
import { loadOwnedBusinessWorkspace } from "@/lib/talent-site/server/workspace-site-context";
import { logServerError } from "@/lib/server/safe-error";
import type { TalentSiteDashboardState, TalentSiteRow } from "@/lib/talent-site/types";
import { parseTalentSiteSnapshot } from "@/lib/talent-site/validation";
import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import { maxSitePublicGate } from "@/lib/talent-site/resolve-max-site-core";
import { talentSitePathUrl, talentSitePublicUrl } from "@/lib/talent-site/site-public-url";
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

/**
 * Live personal-site address for dashboard preview / "My website" links.
 * Precedence matches Max-site public links:
 *   1. primary active custom domain
 *   2. `<slug>.tulala.digital` when the subdomain switch is on
 *   3. `/t/site/<slug>` path form when published
 * Unpublished / no-slug / plan-gated sites leave this null so callers fall
 * back to the hub (same `maxSitePublicGate` the public renderer uses).
 */
function publishedPersonalSiteUrl(input: {
  siteSlug: string | null | undefined;
  sitePublishedAt: string | null | undefined;
  customDomain: string | null | undefined;
  planKey: string | null | undefined;
  isDemo?: boolean;
}): string | null {
  if (
    !maxSitePublicGate({
      sitePublishedAt: input.sitePublishedAt ?? null,
      planKey: input.planKey,
    })
  ) {
    return null;
  }
  const domain = (input.customDomain ?? "").trim().toLowerCase();
  if (domain) return `https://${domain}`;
  const slug = input.siteSlug ?? null;
  if (isTalentSiteSubdomainsEnabled()) {
    const hostUrl = talentSitePublicUrl(slug, { isDemo: input.isDemo === true });
    if (hostUrl) return hostUrl;
  }
  return talentSitePathUrl(slug);
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
  /** Published personal website (custom domain / vanity host / path), if any. */
  let personalSiteUrl: string | null = null;
  let templateKey: string | null = null;
  let compositionMode: TalentSiteDashboardState["compositionMode"] = null;

  if (admin && assertTalentCanEditPersonalSite(scope.planKey) && profileCode) {
    // TUL-77: a business owner's website is the workspace site. Never create
    // a personal site silently for them; the "create your website" path
    // (/talent/public-page) makes one when they choose to.
    const [existingSite, owned] = await Promise.all([
      admin.from("talent_sites").select("id").eq("talent_profile_id", scope.talentProfile.id).maybeSingle(),
      loadOwnedBusinessWorkspace(admin, scope.session.user.id),
    ]);
    if (existingSite.error) logServerError("talentSite.dashboard.siteProbe", existingSite.error);
    if (
      !existingSite.error &&
      shouldAutoCreatePersonalSite({
        ownsBusinessWorkspace: owned.ownsBusinessWorkspace,
        hasPersonalSite: !!existingSite.data,
      })
    ) {
      await provisionTalentPersonalSiteIfMissing(
        scope.talentProfile.id,
        scope.planKey,
        scope.session.user.id,
      );
    }
  }

  if (admin) {
    const [{ data }, demoRes] = await Promise.all([
      admin
        .from("talent_sites")
        .select(
          "id, talent_profile_id, site_kind, site_slug, site_published_at, status, draft_snapshot, published_snapshot, version, draft_updated_at, published_at, unpublished_at, plan_locked, pending_template_reset, created_by, updated_by, created_at, updated_at",
        )
        .eq("talent_profile_id", scope.talentProfile.id)
        .maybeSingle(),
      admin.from("talent_profiles").select("is_demo").eq("id", scope.talentProfile.id).maybeSingle(),
    ]);
    const isDemo = (demoRes.data as { is_demo?: boolean } | null)?.is_demo === true;

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

      const siteMeta = data as {
        site_slug?: string | null;
        site_published_at?: string | null;
      };
      let customDomain: string | null = null;
      if (siteMeta.site_published_at) {
        const { data: domainRow, error: domainErr } = await admin
          .from("talent_site_domains")
          .select("domain")
          .eq("talent_profile_id", scope.talentProfile.id)
          .eq("is_primary", true)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        // Domain lookup failure degrades to vanity/path — never blocks the dashboard.
        if (!domainErr) {
          customDomain = (domainRow as { domain?: string | null } | null)?.domain ?? null;
        }
      }
      personalSiteUrl = publishedPersonalSiteUrl({
        siteSlug: siteMeta.site_slug,
        sitePublishedAt: siteMeta.site_published_at,
        customDomain,
        planKey: scope.planKey,
        isDemo,
      });
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
    talentProfileId: scope.talentProfile.id,
    // Prefer the live personal website; hub `/t/<code>` is the discovery fallback.
    publicSiteUrl: personalSiteUrl ?? (profileCode ? `/t/${profileCode}` : null),
    // `preview=1` forces the standard profile renderer when a published site exists.
    publicProfileUrl: profileCode ? `/t/${profileCode}?preview=1` : null,
    isPubliclyHidden: scope.talentProfile.isPubliclyHidden,
    templateKey,
    compositionMode,
    availableTemplates,
    site,
  };

  return { ok: true, state };
}
