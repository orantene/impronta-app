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
import { loadTalentLocaleSettings, loadTalentLocaleState } from "@/lib/site-admin/server/talent-locale-settings";
import {
  TALENT_LOCALE_SEED_ATTEMPT_COOKIE,
  talentLocaleSeedHref,
  talentLocaleSeedPlan,
} from "@/lib/site-admin/server/talent-locale-seed";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { LOCALE_AUTO_COOKIE, LOCALE_OWNER_COOKIE } from "@/i18n/locale-cookies";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { buildTalentBuilderCanvasData } from "@/lib/talent-site/server/talent-builder-canvas.server";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { provisionTalentMaxSite } from "@/lib/talent-site/server/provision-max-site";
import { loadSiteRev } from "@/lib/talent-site/history/history.server";
import type { MaxSiteManagerPage } from "@/lib/talent-site/server/site-management-types";
import { buildTalentSiteCapabilities } from "@/lib/access/talent-membership";
import { TalentPageBuilderScreen } from "@/components/talent/site/TalentPageBuilderScreen";
import {
  buildEmptyTalentPageComposition,
  resolveTalentPageEditorTree,
  type TalentPageRow,
} from "@/lib/site-admin/builder-core/adapters/talent-page-adapter-core";
import type { CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";

export const dynamic = "force-dynamic";

const HOME_FALLBACK_SLUG = "home";

/** The editor row: the adapter's own column set plus the live body, so the
 *  server-primed composition matches what a client `load()` builds. */
const EDITOR_ROW_COLUMNS =
  "id, talent_profile_id, slug, title, status, blocks, blocks_published, theme, required_talent_tier, " +
  "published_at, updated_at, meta_description, og_title, og_description, og_image_url, canonical_url, " +
  "noindex, json_ld, style_classes, style_presets";

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

/** Managing agency tenant for builder scope + the section-embed preview: the
 *  active agency context, else the profile's owning agency. */
async function resolveBuilderTenantId(profileId: string): Promise<string | null> {
  const activeAgency = await getActiveTalentAgencyContext(profileId);
  if (activeAgency?.tenantId) return activeAgency.tenantId;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("talent_profiles")
    .select("created_by_agency_id")
    .eq("id", profileId)
    .maybeSingle();
  return (data as { created_by_agency_id: string | null } | null)?.created_by_agency_id ?? null;
}

/** "A site exists": Max is provisioned (idempotent, Max-gated) so it always
 *  does; a lower tier that can edit is probed for a site slug. */
async function resolveSiteExists(input: {
  profileId: string;
  isMax: boolean;
  canEdit: boolean;
  userId: string;
}): Promise<boolean> {
  if (input.isMax) {
    await provisionTalentMaxSite(input.profileId, input.userId);
    return true;
  }
  if (!input.canEdit) return false;
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data: siteRow, error: siteError } = await admin
    .from("talent_sites")
    .select("site_slug")
    .eq("talent_profile_id", input.profileId)
    .maybeSingle();
  // PostgREST does not throw: a denied policy and "no row yet" both arrive as
  // data:null. Record the difference instead of reading a failed probe as
  // "this talent has no site".
  if (siteError) logServerError("talentPageBuilder/siteExistsProbe", siteError);
  return !siteError && !!(siteRow as { site_slug: string | null } | null)?.site_slug;
}

/** The editor row for a slug, or the home page when `{ home: true }`. */
async function loadEditorRow(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  profileId: string,
  by: { slug: string } | { home: true },
): Promise<TalentPageRow | null> {
  const base = admin
    .from("talent_pages")
    .select(EDITOR_ROW_COLUMNS)
    .eq("talent_profile_id", profileId);
  const { data, error } =
    "slug" in by
      ? await base.eq("slug", by.slug).maybeSingle()
      : await base.eq("is_home", true).order("sort_order", { ascending: true }).limit(1).maybeSingle();
  if (error) logServerError("talentPageBuilder/editorRow", error);
  return (data as unknown as TalentPageRow | null) ?? null;
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

  // F93 - the independent server loads run as ONE parallel batch instead of a
  // 6-deep serial chain (locale, provision/site probe, agency tenant, talent
  // locales). Only provision -> (pages, editor row) is a real dependency.
  const siteCapabilities = buildTalentSiteCapabilities(profile.talentPlanKey);
  const canEdit = siteCapabilities.personalSiteEdit;
  const isMax = profile.talentPlanKey === "talent_portfolio" || profile.talentTier === "max";

  // F132 - the builder is mounted bare (no dashboard layout), so it reconciles
  // the language cookie itself: a foreign or unowned cookie never overrides the
  // talent's own primary. One hop through the seed route writes the cookie.
  const localeState = await loadTalentLocaleState(profile.id);
  const builderJar = await cookies();
  const seedPlan = builderJar.get(TALENT_LOCALE_SEED_ATTEMPT_COOKIE)?.value
    ? null
    : talentLocaleSeedPlan({
        cookieLocale: builderJar.get(LOCALE_COOKIE)?.value ?? null,
        cookieIsAuto: Boolean(builderJar.get(LOCALE_AUTO_COOKIE)?.value),
        cookieOwner: builderJar.get(LOCALE_OWNER_COOKIE)?.value ?? null,
        userId: session.user.id,
        primary: localeState.seedPrimary,
      });
  if (seedPlan && (seedPlan.locale || seedPlan.stamp)) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") qs.set(k, v);
    const query = qs.toString();
    redirect(talentLocaleSeedHref(`/talent/page-builder${query ? `?${query}` : ""}`));
  }

  const [locale, talentLocale, tenantId, siteExists] = await Promise.all([
    getRequestLocale(),
    // PR 7: the builder's content-locale pill + inspector tabs follow the
    // talent's own languages (primary first), not the managing agency's.
    loadTalentLocaleSettings(profile.id),
    resolveBuilderTenantId(profile.id),
    resolveSiteExists({ profileId: profile.id, isMax, canEdit, userId: session.user.id }),
  ]);

  // Phase 1 gate: "a site exists AND the talent can edit it" replaces the old
  // "is Max" gate (see resolveSiteExists). A lower tier (switch on) may be able
  // to edit but have no site yet: send it back to the Public page screen.
  if (canEdit && !siteExists) {
    redirect("/talent/public-page");
  }
  const hasBuilderAccess = canEdit && siteExists;

  // Load the site's pages (switcher + active slug) IN PARALLEL with a
  // speculative editor-row read (the requested page, else the home page) and
  // the site revision. The speculation only misses when the requested slug is
  // unknown or no page is flagged home; that one case refetches below.
  let sitePages: MaxSiteManagerPage[] = [];
  let editorRow: TalentPageRow | null = null;
  let siteRev: Awaited<ReturnType<typeof loadSiteRev>> | null = null;
  const admin = hasBuilderAccess ? createServiceRoleClient() : null;
  let speculativeRow: TalentPageRow | null = null;
  if (admin) {
    const [pagesRes, row, rev] = await Promise.all([
      admin
        .from("talent_pages")
        .select(PAGE_COLUMNS)
        .eq("talent_profile_id", profile.id)
        .order("sort_order", { ascending: true }),
      shellMode
        ? Promise.resolve(null)
        : loadEditorRow(admin, profile.id, requestedPage ? { slug: requestedPage } : { home: true }),
      shellMode ? Promise.resolve(null) : loadSiteRev(admin, profile.id),
    ]);
    sitePages = ((pagesRes.data ?? []) as Array<Record<string, unknown>>).map(mapPage);
    speculativeRow = row;
    siteRev = rev;
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
  //
  // The page row is read ONCE here (service role; `profile` is the signed-in
  // talent's own row, so this is the owner reading their own page) and handed
  // to the editor as its initial composition. The editor then opens on exactly
  // the tree visitors see (draft, falling back to the live body) instead of
  // waiting on a client round-trip whose failure used to leave an empty
  // "Describe your page" canvas with no error. No row yet (brand-new page) ->
  // null, and the client adapter's ensurePage creates it as before.
  let canvasRenderData = null;
  let initialComposition: CompositionData | null = null;
  if (admin && hasBuilderAccess && !shellMode) {
    editorRow =
      speculativeRow && speculativeRow.slug === activeSlug
        ? speculativeRow
        : await loadEditorRow(admin, profile.id, { slug: activeSlug });
    // Theme releases Phase 2 — the CAS version is the site's draft_rev.
    if (editorRow && siteRev) editorRow = { ...editorRow, draft_rev: siteRev.draftRev };
    if (editorRow) initialComposition = buildEmptyTalentPageComposition(editorRow, locale);
  }
  if (hasBuilderAccess && !shellMode) {
    try {
      let draftTree: BuilderNodeTree = [];
      let pageTheme: unknown = null;
      if (admin) {
        const row = editorRow;
        draftTree = row ? (resolveTalentPageEditorTree(row) as BuilderNodeTree) : [];
        pageTheme = row?.theme ?? null;
      }
      canvasRenderData = await buildTalentBuilderCanvasData({
        talentProfileId: profile.id,
        pageSlug: activeSlug,
        tree: draftTree,
        pageTheme,
        tenantId,
      });
    } catch (error) {
      logServerError("talentPageBuilder/canvasRenderData", error);
      canvasRenderData = null;
    }
  }

  return (
    <TalentPageBuilderScreen
      talentLocales={{ primary: talentLocale.defaultLocale, secondary: [...talentLocale.secondaryLocales] }}
      talentProfileId={profile.id}
      pageSlug={activeSlug}
      tenantId={tenantId ?? ""}
      talentPlanKey={profile.talentPlanKey}
      talentTier={profile.talentTier}
      siteCapabilities={siteCapabilities}
      talentDisplayName={profile.displayName}
      talentHeadshotUrl={profile.headshotUrl}
      locale={locale}
      canvasRenderData={canvasRenderData}
      initialComposition={initialComposition}
      shellMode={shellMode}
      sitePages={sitePages}
    />
  );
}
