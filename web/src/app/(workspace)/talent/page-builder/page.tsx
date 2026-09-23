/**
 * Talent freeform Page Builder — editor entry (multi-page).
 *
 * Route: `/talent/page-builder` (app host). Resolves the signed-in talent's own
 * `talent_profiles.id`, plan key / tier, and managing agency `tenantId`
 * server-side, then mounts the ONE Page Builder Core which persists to
 * `talent_pages.blocks` (a page) or `talent_sites.shell_tree` (the shell).
 *
 * Query params (multi-page):
 *   - `?page=<slug>`  — edit that page's blocks (default = the home page).
 *   - `?shell=1`      — edit the SITE SHELL (header/logo/footer) instead.
 *
 * Gating (Phase 1): the editor requires a SITE to exist AND
 * `personalSiteEdit` (`siteCapabilities`). While `TALENT_FREE_WEBSITE_ENABLED`
 * is off, `personalSiteEdit` resolves Max-only, so this is byte-identical to
 * the old "is Max" gate — only `talent_portfolio` ever has a provisioned
 * site. A talent who CAN edit but has no site yet (Free tier, switch on,
 * before the create wizard ships) is redirected to the Public page screen
 * instead of an empty editor. A talent who cannot edit at all sees the "Web
 * Office" upsell (not a 404). An anonymous / non-talent user is redirected to
 * login by the talent layout's session guard.
 *
 * The talent layout renders this route bare (no dashboard shell) so the editor
 * owns the full viewport.
 */

import { redirect } from "next/navigation";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfileByUser } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { getActiveTalentAgencyContext } from "@/lib/talent/active-agency-context";
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { buildInEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { readTalentDesignSlice } from "@/lib/site-admin/edit-mode/talent-design-store";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { provisionTalentMaxSite } from "@/lib/talent-site/server/provision-max-site";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";
import { buildTalentSiteCapabilities } from "@/lib/access/talent-membership";
import { TalentPageBuilderScreen } from "@/components/talent/site/TalentPageBuilderScreen";

export const dynamic = "force-dynamic";

const HOME_FALLBACK_SLUG = "home";

const PAGE_COLUMNS =
  "id, slug, title, nav_label, status, is_home, sort_order, published_at, updated_at";

function mapPage(p: Record<string, unknown>): MaxSiteManagerPage {
  return {
    id: p.id as string,
    slug: p.slug as string,
    title: p.title as string,
    navLabel: (p.nav_label as string | null) ?? null,
    status: p.status as string,
    isHome: Boolean(p.is_home),
    sortOrder: (p.sort_order as number) ?? 0,
    publishedAt: (p.published_at as string | null) ?? null,
    updatedAt: p.updated_at as string,
  };
}

export default async function TalentPageBuilderRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) {
    redirect("/login?next=/talent/page-builder");
  }

  const profile = await loadTalentSelfProfileByUser(session.user.id);
  if (!profile) {
    redirect("/talent/today");
  }

  const sp = (await searchParams) ?? {};
  const shellMode = sp.shell === "1" || sp.shell === "true";
  const requestedPage = typeof sp.page === "string" ? sp.page : null;

  const locale = await getRequestLocale();

  // Phase 1 — the capability record every personal-site surface reads. While
  // `TALENT_FREE_WEBSITE_ENABLED` is off this resolves Max-only for every key,
  // so `canEdit` below stays byte-identical to the old `isMax` check.
  const siteCapabilities = buildTalentSiteCapabilities(profile.talentPlanKey);
  const canEdit = siteCapabilities.personalSiteEdit;
  const isMax = profile.talentPlanKey === "talent_portfolio" || profile.talentTier === "max";

  // Provision the Max site (idempotent) so the page-set + shell exist before we
  // load them. `provisionTalentMaxSite` is itself Max-gated (refuses any other
  // plan), so it only ever runs — and only ever needs to run — for the legacy
  // Max path. A Free-tier talent's site is created through the wizard (Phase
  // 3), never auto-provisioned here.
  if (isMax) {
    await provisionTalentMaxSite(profile.id, session.user.id);
  }

  // Phase 1 gate: "a site exists AND the talent can edit it" replaces the old
  // "is Max" gate. Max is always provisioned above, so its site always
  // exists by this point; a lower tier (switch on) may be able to edit but
  // have no site yet — send it back to the Public page screen instead of an
  // editor with nothing to edit.
  let siteExists = isMax;
  if (canEdit && !isMax) {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data: siteRow, error: siteError } = await admin
        .from("talent_sites")
        .select("site_slug")
        .eq("talent_profile_id", profile.id)
        .maybeSingle();
      // PostgREST does not throw: a denied policy and "no row yet" both arrive
      // as data:null. Record the difference instead of reading a failed probe
      // as "this talent has no site". Either way they land on the Public page
      // screen, which is a working surface, not an empty editor.
      if (siteError) logServerError("talentPageBuilder/siteExistsProbe", siteError);
      siteExists = !siteError && !!(siteRow as { site_slug: string | null } | null)?.site_slug;
    }
  }
  if (canEdit && !siteExists) {
    redirect("/talent/public-page");
  }
  const hasBuilderAccess = canEdit && siteExists;

  // Resolve the managing agency tenant for builder scope + the in-editor
  // section-embed preview (prefer the active agency context; fall back to the
  // profile's owning agency).
  const activeAgency = await getActiveTalentAgencyContext(profile.id);
  let tenantId = activeAgency?.tenantId ?? null;
  if (!tenantId) {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data } = await admin
        .from("talent_profiles")
        .select("created_by_agency_id")
        .eq("id", profile.id)
        .maybeSingle();
      tenantId =
        (data as { created_by_agency_id: string | null } | null)
          ?.created_by_agency_id ?? null;
    }
  }

  // Load the site's pages (for the switcher + to resolve the active page slug).
  let sitePages: MaxSiteManagerPage[] = [];
  if (hasBuilderAccess) {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data } = await admin
        .from("talent_pages")
        .select(PAGE_COLUMNS)
        .eq("talent_profile_id", profile.id)
        .order("sort_order", { ascending: true });
      sitePages = ((data ?? []) as Array<Record<string, unknown>>).map(mapPage);
    }
  }

  // Resolve the page slug being edited: explicit `?page=`, else the home page,
  // else the first page, else the legacy "home" slug.
  const homePage = sitePages.find((p) => p.isHome) ?? sitePages[0] ?? null;
  const activeSlug =
    requestedPage && sitePages.some((p) => p.slug === requestedPage)
      ? requestedPage
      : homePage?.slug ?? HOME_FALLBACK_SLUG;

  // Prime the in-editor canvas for the active PAGE (not the shell — the shell
  // surface paints from its own load). Best-effort.
  let canvasRenderData = null;
  if (hasBuilderAccess && !shellMode && tenantId) {
    try {
      const admin = createServiceRoleClient();
      let draftTree: BuilderNodeTree = [];
      let talentComponentStyleDefaults = null;
      let talentDesignTokens: Record<string, string> | null = null;
      if (admin) {
        const { data: pageRow } = await admin
          .from("talent_pages")
          .select("blocks, theme")
          .eq("talent_profile_id", profile.id)
          .eq("slug", activeSlug)
          .maybeSingle();
        const row = pageRow as { blocks: BuilderNodeTree | null; theme: unknown } | null;
        draftTree = (row?.blocks ?? []) as BuilderNodeTree;
        const slice = readTalentDesignSlice(row?.theme);
        const platformDefault = await loadPlatformDefaultTheme("talent");
        talentComponentStyleDefaults =
          Object.keys(slice.componentStyles).length > 0
            ? slice.componentStyles
            : platformDefault.componentStyles;
        talentDesignTokens =
          Object.keys(slice.tokens).length > 0 ? slice.tokens : platformDefault.tokens;
      }
      canvasRenderData = await buildInEditorCanvasRenderData({
        tree: draftTree,
        tenantId,
        locale,
        previewSubject: { kind: "talent", id: profile.id },
        componentStyleDefaultsOverride: talentComponentStyleDefaults,
        designTokens: talentDesignTokens,
      });
    } catch {
      canvasRenderData = null;
    }
  }

  return (
    <TalentPageBuilderScreen
      talentProfileId={profile.id}
      pageSlug={activeSlug}
      tenantId={tenantId ?? ""}
      talentPlanKey={profile.talentPlanKey}
      talentTier={profile.talentTier}
      siteCapabilities={siteCapabilities}
      talentDisplayName={profile.displayName}
      locale={locale}
      canvasRenderData={canvasRenderData}
      shellMode={shellMode}
      sitePages={sitePages}
    />
  );
}
