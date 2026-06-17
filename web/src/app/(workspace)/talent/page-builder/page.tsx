/**
 * Talent freeform Page Builder — Max-tier-gated editor entry (multi-page).
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
 * Gating (§E): ONLY talents on the Max tier (`talent_plan_key='talent_portfolio'`)
 * reach the editor. A non-Max talent gets an upsell (not a 404). An anonymous /
 * non-talent user is redirected to login by the talent layout's session guard.
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
import { buildInEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { readTalentDesignSlice } from "@/lib/site-admin/edit-mode/talent-design-store";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { provisionTalentMaxSite } from "@/lib/talent-site/server/provision-max-site";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";
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

  const isMax = profile.talentPlanKey === "talent_portfolio" || profile.talentTier === "max";

  // Provision the Max site (idempotent) so the page-set + shell exist before we
  // load them. Non-Max talents skip this — the screen renders the upsell.
  if (isMax) {
    await provisionTalentMaxSite(profile.id, session.user.id);
  }

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
  if (isMax) {
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
  if (isMax && !shellMode && tenantId) {
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
      talentDisplayName={profile.displayName}
      locale={locale}
      canvasRenderData={canvasRenderData}
      shellMode={shellMode}
      sitePages={sitePages}
    />
  );
}
