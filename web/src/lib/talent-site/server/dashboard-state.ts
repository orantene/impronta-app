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
import type { TalentSiteDashboardState, TalentSiteRow } from "@/lib/talent-site/types";
import { parseTalentSiteSnapshot } from "@/lib/talent-site/validation";
import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import { maxSitePublicGate } from "@/lib/talent-site/resolve-max-site-core";
import { talentSitePathUrl, talentSitePublicUrl } from "@/lib/talent-site/site-public-url";
import type { EffectiveReadContext } from "@/lib/impersonation/effective-read";
import { resolveMyWebsiteTarget } from "@/lib/talent-site/my-website-target";
import { loadOwnedBusinessWorkspace } from "@/lib/talent-site/server/workspace-site-context";
import { resolveWorkspaceSitePublicUrl } from "@/lib/talent-site/workspace-site-editor-url";

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

export type PersonalSiteStateDeps = {
  requireTalentSelf: typeof requireTalentSelf;
  admin: () => ReturnType<typeof createServiceRoleClient>;
};

const DEFAULT_STATE_DEPS: PersonalSiteStateDeps = {
  requireTalentSelf,
  admin: () => createServiceRoleClient(),
};

export async function loadTalentPersonalSiteDashboardState(
  tenantSlug?: string,
  /**
   * TUL-245: from `effectiveReadContext` only. Under a verified impersonation
   * the state is the acted-as talent's, and the first-visit provisioning WRITE
   * is skipped (impersonation is read-only).
   */
  ctx?: EffectiveReadContext,
  deps: PersonalSiteStateDeps = DEFAULT_STATE_DEPS,
): Promise<
  | { ok: true; state: TalentSiteDashboardState }
  | { ok: false; code: string; error: string }
> {
  const scope = tenantSlug
    ? await requireTalentSelfScope(tenantSlug, ctx)
    : await deps.requireTalentSelf(ctx);
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }

  const membership: TalentMembershipState = buildTalentMembershipState(scope.planKey);
  const profileCode = scope.talentProfile.profileCode;

  const admin = deps.admin();
  let site: TalentSiteDashboardState["site"] = null;
  /** Published personal website (custom domain / vanity host / path), if any. */
  let personalSiteUrl: string | null = null;
  let templateKey: string | null = null;
  let compositionMode: TalentSiteDashboardState["compositionMode"] = null;

  // READ-ONLY (TUL-179): this runs in the talent layout on every page view, so
  // it must never create a site. Creation is an explicit click
  // (`ensureMaxSiteAction`).

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

  // TUL-77 / TUL-347: when "My website" is the business workspace, surface that
  // live URL on Hoy / presence (not the personal subdomain the owner may also have).
  let publicSiteUrl: string | null = personalSiteUrl ?? (profileCode ? `/t/${profileCode}` : null);
  if (admin && scope.session.user?.id) {
    const owned = await loadOwnedBusinessWorkspace(admin, scope.session.user.id);
    const target = resolveMyWebsiteTarget({
      ownsBusinessWorkspace: owned.ownsBusinessWorkspace,
      hasWorkspaceSite: owned.hasWorkspaceSite,
      workspaceSlug: owned.workspaceSlug,
      hasPersonalSite: Boolean(site),
    });
    if (target.kind === "workspace" && owned.tenantId) {
      publicSiteUrl = await resolveWorkspaceSitePublicUrl(admin, {
        tenantId: owned.tenantId,
        slug: target.slug,
      });
    }
  }

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
    publicSiteUrl,
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
