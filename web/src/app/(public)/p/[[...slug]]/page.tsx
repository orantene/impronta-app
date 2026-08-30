import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { SitePageViewAnalytics } from "@/components/analytics/site-page-view-analytics";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { loadBuilderNodeDataSources } from "@/components/home/homepage-cms-data-sources";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { slugPathFromParams } from "@/lib/cms/paths";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { buildTenantLocaleAlternates } from "@/lib/seo/locale-alternates";
import { getPublicTenantScope, getPublicPathPrefix } from "@/lib/saas/scope";
import { loadPageForRender } from "@/lib/site-admin/server/page-reads";
import { loadPublicComponentStyleDefaults } from "@/lib/site-admin/server/reads";
import {
  BuilderNodeFontLinks,
  BuilderNodeRendererStyles,
  collectPresentNodeKinds,
} from "@/lib/site-admin/builder-node/render";
import { renderFreeformPageRootTree } from "@/lib/site-admin/builder-node/freeform-page-blocks";
import { resolveExperimentRenderContext } from "@/lib/site-admin/builder-node/experiment-context";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { buildInEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { isBuilderClientCanvasEnabled } from "@/lib/site-admin/edit-mode/client-canvas-flag";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { StorefrontBodyCanvas } from "@/components/edit-chrome/storefront-body-canvas";
import { StorefrontBodyServerMarker } from "@/components/edit-chrome/storefront-body-server-marker";
import { isPreviewActiveForTenant } from "@/lib/site-admin/server/homepage-reads";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { localizeHrefsDeep } from "@/lib/saas/locale-hrefs-deep";
import { applyNestedI18nOverlay } from "@/lib/site-admin/builder-node/nested-i18n";
import { localeUrlSettings } from "@/i18n/pathnames";
import {
  contentLocaleForDesignRow,
  resolveDesignLocale,
} from "@/lib/site-admin/server/design-locale";
import { userHasCapability } from "@/lib/access";
import { shouldRouteSiteShellSurface } from "@/lib/site-admin/site-shell-flag";
import { SITE_SHELL_EDITOR_SLUG } from "@/lib/admin/website-editor-links";
import { AgencyChatLauncherMount } from "@/app/(public)/_chat/AgencyChatLauncherMount";
import {
  jsonLdDocumentToScript,
  type JsonLdDocument,
} from "@/lib/site-admin/cms-seo";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * P4-SEO — operator-authored schema.org JSON-LD for a published CMS page.
 * Read once (scoped to tenant/locale/slug) and emitted as a structured-data
 * script in whichever render branch matches. Returns null when none is set.
 */
async function loadPageJsonLdScript(
  supabase: SupabaseClient,
  tenantId: string,
  locale: string,
  slugPath: string,
): Promise<string> {
  const { data } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
    .select("json_ld")
    .eq("locale", locale)
    .eq("slug", slugPath)
    .maybeSingle<{ json_ld: JsonLdDocument | null }>();
  return jsonLdDocumentToScript(data?.json_ld ?? null);
}

function JsonLdScript({ script }: { script: string }) {
  if (!script) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}

type FreeformPageRow = {
  id: string;
  title: string;
  blocks: BuilderNode[];
  is_freeform: boolean;
  status: string;
  locale: string;
};

/**
 * Pick the row that supplies the DESIGN from a multi-locale lookup: the first
 * locale in `lookupOrder` that actually came back. That is the primary-language
 * row when it exists, otherwise the requested locale's own row (a page authored
 * only in a secondary language). Returns null when neither matched.
 */
function pickDesignRow(
  rows: FreeformPageRow[] | null,
  lookupOrder: readonly string[],
): FreeformPageRow | null {
  if (!rows || rows.length === 0) return null;
  for (const code of lookupOrder) {
    const match = rows.find((row) => row.locale === code);
    if (match) return match;
  }
  return null;
}

type CmsPagePublic = {
  title: string;
  body: string;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  canonical_url: string | null;
  locale: string;
  slug: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug: slugParam } = await params;
  const slugPath = slugPathFromParams(slugParam);
  if (!slugPath) return { title: "Not found" };

  const locale = await getRequestLocale();
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { title: "Not found" };

  const publicScope = await getPublicTenantScope();
  if (!publicScope) return { title: "Not found" };

  const metaCols =
    "title,meta_title,meta_description,og_title,og_description,og_image_url,noindex,canonical_url,locale,slug";
  // Read EVERY published locale of this slug, not just the requested one. The
  // extra rows cost nothing (same slug, same RPC) and they are the only honest
  // source for the hreflang set: a page translated to EN only must not advertise
  // an `/es/p/<slug>` alternate, because that URL `notFound()`s.
  const { data } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select(metaCols)
    .eq("slug", slugPath);

  const publishedRows = (data ?? []) as unknown as CmsPagePublic[];
  const publishedLocales = publishedRows.map((row) => row.locale);
  let page = publishedRows.find((row) => row.locale === locale) ?? null;
  // Draft metadata for staff/preview viewers — mirrors the page body's
  // draft-reader gate so an unpublished draft doesn't tab-title as "Not found"
  // for the person editing it. Anonymous visitors still get "Not found".
  if (!page) {
    const draftReader =
      (await isPreviewActiveForTenant(publicScope.tenantId)) ||
      // Membership-based draft reader (2026-08-04): the former requireStaff()
      // gate keyed on the GLOBAL profiles.app_role and so hid a hybrid
      // workspace owner's OWN unpublished draft from them. Scoped to this
      // storefront's tenant, so it is also strictly narrower than before.
      (await userHasCapability("agency.site_admin.pages.edit", publicScope.tenantId));
    if (draftReader) {
      const draft = await supabase
        .from("cms_pages")
        .select(metaCols)
        .eq("tenant_id", publicScope.tenantId)
        .eq("locale", locale)
        .eq("slug", slugPath)
        .maybeSingle();
      page = (draft.data as CmsPagePublic | null) ?? null;
    }
  }
  if (!page) return { title: "Not found" };

  // Locale-free, prefix-free path. `buildTenantLocaleAlternates` adds both the
  // locale segment and the path-based tenant prefix (`/impronta/p/<slug>` on a
  // shared host), which the previous hardcoded `/p/<slug>` dropped.
  const pathWithoutLocale = `/p/${slugPath}`;
  const alt = await buildTenantLocaleAlternates(locale, pathWithoutLocale, {
    // A draft previewed by staff has no published row, so fall back to the
    // locale being rendered rather than claiming translations that are not live.
    availableLocales:
      publishedLocales.length > 0 ? publishedLocales : [page.locale],
  });
  const title = page.meta_title?.trim() || page.title;
  const description = page.meta_description?.trim() || undefined;
  const openGraph = {
    title: page.og_title?.trim() || title,
    description: page.og_description?.trim() || description,
    ...(page.og_image_url ? { images: [{ url: page.og_image_url }] } : {}),
  };

  const canonical = page.canonical_url?.trim();
  const altLinks = alt.alternates;

  return {
    ...alt,
    title,
    description,
    robots: page.noindex ? { index: false, follow: true } : undefined,
    // An operator-set canonical_url always wins; otherwise keep whatever the
    // request-anchored builder produced (possibly nothing, on an unresolvable
    // host — better than a cross-domain canonical).
    ...(canonical
      ? { alternates: { ...altLinks, canonical } }
      : {}),
    openGraph,
  };
}

export default async function CmsPublicPage({
  params,
  // Guest-chat launcher mount. Default ON: a generic `/p/<slug>` visit renders
  // under `(public)/layout.tsx` (which supplies the discovery/inquiry providers)
  // and should carry the floating "Message {agency}" launcher, gated on the
  // master `enabled` switch only (a generic CMS page has no per-page flag).
  // Callers that render CmsPublicPage AS the home or directory surface
  // (app/page.tsx home role, directory/page.tsx assigned-directory role) pass
  // `false` and mount the launcher themselves with the correct per-surface
  // sourcePage ("/" → show_on_home, "/directory" → show_on_directory) — this
  // prevents a double launcher on those surfaces.
  mountChatLauncher = true,
}: {
  params: Promise<{ slug?: string[] }>;
  mountChatLauncher?: boolean;
}) {
  const { slug: slugParam } = await params;
  // ROOT-CAUSE FIX (2026-08-20): `__site_shell__` can NEVER pass
  // slugPathFromParams — SLUG_SEGMENT forbids underscores — so this notFound()
  // fired before the Lane-2 shell branch below ever ran. The branch comparing
  // `slugPath === SITE_SHELL_EDITOR_SLUG` was unreachable dead code, and the
  // shell editor always rendered as edit chrome mounted over the tenant 404
  // (the exact failure the branch's own comment says it fixed). The sentinel
  // is compared by EXACT string, never queried as a tenant slug, so letting it
  // through the validator is safe.
  const rawSlugPath = slugParam?.join("/") ?? "";
  const slugPath =
    rawSlugPath === SITE_SHELL_EDITOR_SLUG
      ? SITE_SHELL_EDITOR_SLUG
      : slugPathFromParams(slugParam);
  if (!slugPath) notFound();

  // Generic-page sourcePage — never "/" or "/directory", so AgencyChatLauncherMount
  // gates on `enabled` alone (no per-page flag for arbitrary CMS pages).
  const launcherSourcePage = `/p/${slugPath}`;

  const locale = await getRequestLocale();
  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  const publicScope = await getPublicTenantScope();
  if (!publicScope) notFound();

  // ── Lane 2 — the SITE SHELL editing surface ──────────────────────────────
  //
  // `edit-path.ts` already resolves `/p/__site_shell__` to ownership kind
  // `site_shell`, and `edit-chrome-mount.tsx` already mounts the editor for it
  // once ENABLE_SITE_SHELL_EDIT is on. What was missing is a BODY: every branch
  // below excludes system-owned rows, so the surface 404'd and flipping the flag
  // mounted the edit chrome over a not-found page (the failure this route's own
  // comments describe, where the canvas ends up painted below the 404 footer).
  //
  // The body is deliberately minimal: the self-gating <PublicHeader> and
  // <PublicFooter> ARE the shell being edited (on a shell-enabled tenant they
  // render the snapshot shell), with a representative spacer between them
  // standing in for page content. That gives the operator the real header and
  // footer to select, with nothing else on the canvas to confuse the selection.
  //
  // TWO GATES, both required, so this is NOT a public surface:
  //   1. the ENABLE_SITE_SHELL_EDIT flag (off by default), and
  //   2. staff edit capability on this tenant.
  // A visitor — or staff of another tenant — falls through to the normal
  // slug lookup, which does not resolve `__site_shell__` and 404s as before.
  if (slugPath === SITE_SHELL_EDITOR_SLUG) {
    const shellSurfaceAllowed =
      shouldRouteSiteShellSurface(publicScope.tenantId) &&
      (await userHasCapability(
        "agency.site_admin.pages.edit",
        publicScope.tenantId,
      ));
    if (!shellSurfaceAllowed) notFound();
    const tShell = createTranslator(locale);
    return (
      <>
        <SkipToContent />
        <PublicHeader />
        <main
          id="main-content"
          className="w-full flex-1"
          data-site-shell-surface-body=""
        >
          <div className="mx-auto flex min-h-[45vh] max-w-3xl flex-col items-center justify-center gap-2 px-6 py-24 text-center">
            <p className="text-sm font-medium text-foreground">
              {tShell("public.siteShellSurface.title")}
            </p>
            <p className="text-sm text-muted-foreground">
              {tShell("public.siteShellSurface.body")}
            </p>
          </div>
        </main>
        <PublicFooter />
      </>
    );
  }

  // P4-SEO — one structured-data read shared by every render branch below.
  const jsonLdScript = await loadPageJsonLdScript(
    supabase,
    publicScope.tenantId,
    locale,
    slugPath,
  );

  // Wave 4.1 — cms_pages opted into FREEFORM (is_freeform=true). Render the
  // BuilderNode[] tree directly (same engine as talent pages),
  // wrapped in the public shell. Slot-composed pages (homepage, system, legacy)
  // have is_freeform=false and fall through to the snapshot branch below.
  if (publicScope && slugPath) {
    // Public visitors see PUBLISHED freeform pages only. Drafts render ONLY when
    // a signed preview JWT is present (isPreviewActiveForTenant) — gated exactly
    // like the slot/homepage paths (loadPageForRender / loadHomepageForRender).
    // The non-HttpOnly edit cookie is NOT trusted to unlock drafts; enterEditModeAction
    // sets both the JWT and the cookie, so staff editing + preview links still see
    // drafts. On a query error, fall through to the slot/legacy branches.
    const previewActive = await isPreviewActiveForTenant(publicScope.tenantId);
    const freeformCols = "id, title, blocks, is_freeform, status, locale";
    // ONE DESIGN PER PAGE — the tenant's PRIMARY-language row supplies the tree
    // (order, layout, styling, picked talent); the visitor's language is a
    // per-element text overlay resolved by the renderer. Reading strictly
    // `.eq("locale", locale)` is what made `/es` a separate page that ignored
    // every edit made to the primary one. `lookupOrder` still tries the
    // requested locale second, so a page that exists ONLY in a secondary
    // language keeps rendering (as its own design).
    const localeSettings = await loadTenantLocaleSettings(publicScope.tenantId);
    const designPlan = resolveDesignLocale(localeSettings, locale);
    // The PUBLISHED read goes through cms_public_pages_for_tenant — the same
    // SECURITY-INVOKER RPC the metadata read uses. It runs
    // `set_config('app.current_tenant_id', …)` so the cms_pages RLS policy
    // (`cms_pages_select_tenant_published`) admits the row for an anonymous
    // visitor. A direct `.from("cms_pages")` read returns NOTHING for the public
    // SSR client because that client never sets the tenant GUC — so published
    // freeform storefront pages silently failed to render before this.
    const publishedRead = await supabase
      .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
      .select(freeformCols)
      .in("locale", designPlan.lookupOrder as string[])
      .eq("slug", slugPath)
      .eq("is_freeform", true)
      // Defense-in-depth: system-owned pages (homepage, __site_shell__,
      // __directory__) are NEVER freeform — exclude them explicitly so a row
      // mis-flagged is_freeform=true can never render through this clause
      // (don't rely solely on the slug "__" prefix heuristic upstream).
      .eq("is_system_owned", false)
      // NOT `.maybeSingle()`: the lookup spans two locales, so a tenant with
      // both rows legitimately matches 2 and maybeSingle would ERROR — the
      // swallowed-error trap that once blanked every multi-locale page. Take
      // both and pick by design priority below.
      .limit(2);
    let freeformPage = pickDesignRow(publishedRead.data as unknown as FreeformPageRow[] | null, designPlan.lookupOrder);
    let freeformErr = publishedRead.error;
    // Draft preview (staff): the published-only RPC won't surface a draft, so
    // read the row directly — RLS admits it for staff via is_staff_of_tenant
    // (no tenant GUC needed). Attempted when a preview JWT is active, OR for an
    // authenticated staff SESSION (a real server-side auth check — unlike the
    // untrusted non-HttpOnly edit cookie). Without the session fallback, an
    // expired preview JWT mid-edit made this route 404 a staff member's OWN
    // draft: the not-found shell rendered (404 hero + footer) and the
    // edit-chrome canvas then mounted AFTER the footer, so the draft's blocks
    // appeared below the site footer (verified live on /p/untitled-* drafts).
    // The draft read stays tenant-scoped by RLS either way; staff of another
    // tenant read nothing.
    let draftReaderActive = previewActive;
    if (!freeformErr && !freeformPage && !draftReaderActive) {
      draftReaderActive = await userHasCapability(
        "agency.site_admin.pages.edit",
        publicScope.tenantId,
      );
    }
    if (!freeformErr && !freeformPage && draftReaderActive) {
      const draftRead = await supabase
        .from("cms_pages")
        .select(freeformCols)
        .eq("tenant_id", publicScope.tenantId)
        .in("locale", designPlan.lookupOrder as string[])
        .eq("slug", slugPath)
        .eq("is_freeform", true)
        .eq("is_system_owned", false)
        .limit(2);
      freeformPage = pickDesignRow(draftRead.data as unknown as FreeformPageRow[] | null, designPlan.lookupOrder);
      freeformErr = draftRead.error;
    }
    if (
      !freeformErr &&
      freeformPage?.is_freeform &&
      (freeformPage.status === "published" || draftReaderActive)
    ) {
      // ONE DESIGN PER PAGE — the body now comes from the PRIMARY-locale row in
      // every language, so two things have to happen at render time that used
      // to be handled by simply authoring a separate row per language:
      //
      //  1. LINKS — authored hrefs are primary-locale paths (`/contact`), which
      //     on a path-locale site would send a Spanish visitor to the English
      //     page. `localizeHrefsDeep` prefixes them for the active locale. It is
      //     a no-op for the primary locale and idempotent for a page whose links
      //     were authored with a prefix before the collapse.
      //  2. NESTED TEXT — the renderer resolves TOP-LEVEL props through the
      //     overlay itself, but not text one level down (the contact form's
      //     `fields[].label` / `.placeholder`, a section's `requestCta.label`).
      //     Those dotted-path overlays are what made the Spanish contact form
      //     render in English after the collapse.
      const localizedTree = localizeHrefsDeep(
        (freeformPage.blocks ?? []) as BuilderNode[],
        locale,
        localeUrlSettings(
          localeSettings.defaultLocale,
          localeSettings.supportedLocales,
        ),
      );
      const blocks = applyNestedI18nOverlay(
        localizedTree,
        locale,
        localeSettings.defaultLocale,
        localeSettings.fallbackChain(locale),
      );
      const publicPathPrefix = await getPublicPathPrefix();
      const componentStyleDefaults = await loadPublicComponentStyleDefaults(
        publicScope.tenantId,
      );
      // Captcha for native `form` nodes on this page. /api/cms/forms/submit
      // enforces captcha per TENANT, so a form that renders no widget sends no
      // token and EVERY submission is rejected once a provider is configured —
      // the improntamodels.com outage on 2026-08-16. This route renders
      // freeform blocks DIRECTLY (not via HomepageCmsSections), so it needs its
      // own resolution; threading only the other paths left this one blind.
      // Gated on the tree actually containing a form node so pages without one
      // pay no query.
      const pageHasFormNode = (function hasForm(nodes: unknown): boolean {
        if (Array.isArray(nodes)) return nodes.some(hasForm);
        if (!nodes || typeof nodes !== "object") return false;
        const n = nodes as { kind?: unknown; children?: unknown };
        return n.kind === "form" || hasForm(n.children);
      })(blocks);
      const pageCaptcha = pageHasFormNode
        ? await resolveTenantCaptcha(publicScope.tenantId)
        : null;

      // ABTEST-1 — stable per-visitor seed + tenant/surface tags for any A/B
      // CTA/form nodes on this storefront page.
      const experimentContext = await resolveExperimentRenderContext({
        tenantId: publicScope.tenantId,
        surface: "adminWorkspace",
      });

      // Wave-2 cms-page canvas — while edit mode is active (and the client-canvas
      // flag is on, same gate as the homepage at homepage-cms-sections.tsx), the
      // page body mounts `<StorefrontBodyCanvas>` → `<ClientBuilderCanvas>`: the
      // canvas that subscribes to the live tree the editor publishes, so every
      // mutation (insert / duplicate / style edit) repaints IN PLACE instead of
      // persisting invisibly until a hard reload. It renders the SAME
      // root-section-rooted tree through the SAME `renderFreeformPageRootTree`
      // helper (inside ClientBuilderCanvas), against server-assembled data
      // sources + pre-rendered `section_embed` islands — first client paint is
      // the server markup. Anonymous visitors never take this branch: their
      // render below is byte-identical and ships no editor chunk.
      const editModeActive = await isEditModeActiveForTenant(publicScope.tenantId);
      // `draftReaderActive` is only computed when the PUBLISHED read missed, so
      // a PUBLISHED page mid-edit arrives here with it false — re-prove the
      // editor via the same membership capability the draft gate uses. The edit
      // cookie alone is forgeable and must not decide anything; the capability
      // (or the signed preview JWT that set draftReaderActive) is the proof.
      let mountBodyCanvas =
        editModeActive && isBuilderClientCanvasEnabled() && draftReaderActive;
      if (
        !mountBodyCanvas &&
        editModeActive &&
        isBuilderClientCanvasEnabled()
      ) {
        mountBodyCanvas = await userHasCapability(
          "agency.site_admin.pages.edit",
          publicScope.tenantId,
        );
      }
      // Is an AUTHORIZED editor looking at this page right now? Same proof as
      // the canvas gate above (capability, or the signed preview JWT that set
      // `draftReaderActive`) but without the client-canvas flag, because the
      // untranslated cue belongs on the server-rendered editor body too — which
      // is the only body that renders while that flag is off. Drives
      // `editorPreview` only; it grants no data access of its own.
      const editorViewing =
        editModeActive &&
        (draftReaderActive ||
          mountBodyCanvas ||
          (await userHasCapability(
            "agency.site_admin.pages.edit",
            publicScope.tenantId,
          )));
      const editCanvasRenderData = mountBodyCanvas
        ? await buildInEditorCanvasRenderData({
            tree: blocks,
            tenantId: publicScope.tenantId,
            locale,
            publicPathPrefix,
            previewSubject: {
              kind: "workspace",
              id: publicScope.tenantId,
              locale,
            },
            componentStyleDefaultsOverride: componentStyleDefaults,
          })
        : null;
      // Native data blocks (`menu_board`, hero_search, …) need the same
      // server-resolved dataSources HomepageCmsSections already loads —
      // without them the board always renders the empty state on live
      // freeform pages even when workspace Menu items are published.
      const freeformDataSources = mountBodyCanvas
        ? null
        : await loadBuilderNodeDataSources(
            blocks,
            publicScope.tenantId,
            locale,
          );
      return (
        <>
          <SkipToContent />
          {/* ANALYTICS-2 — storefront page-view (freeform CMS page). Only on the
              published path (drafts render under preview; not counted). */}
          {freeformPage.status === "published" ? (
            <SitePageViewAnalytics
              surface="storefront"
              tenantId={publicScope.tenantId}
              pageId={freeformPage.id}
              pageSlug={slugPath}
              locale={locale}
            />
          ) : null}
          <JsonLdScript script={jsonLdScript} />
          <PublicHeader />
          {/* Renderer styles + fonts once at page level — the root-tree helper
              below sets includeRendererStyles/includeFontLinks=false per block
              (same composition as /t/[code]/[pageSlug]). */}
          <BuilderNodeRendererStyles
            kinds={collectPresentNodeKinds(blocks)}
            nodes={blocks}
          />
          <BuilderNodeFontLinks nodes={blocks} />
          <main id="main-content" className="w-full flex-1" data-theme-canvas-root="">
            {/* Stale-body fix (2026-08-15): when edit mode is active but the
                body canvas did NOT mount (flag off / capability gate), the body
                below is a SERVER render. Announce it so the in-editor region
                (a) does not paint the same tree again below the footer and
                (b) does not mount the ClientBuilderCanvas whose mount count
                suppressed the per-edit refresh that keeps THIS render fresh. */}
            {editModeActive && !mountBodyCanvas ? (
              <StorefrontBodyServerMarker />
            ) : null}
            {mountBodyCanvas && editCanvasRenderData ? (
              // EDIT MODE — the live client canvas (see the wave-2 comment at the
              // gate above). Renderer styles/fonts stay server-emitted at page
              // level, matching the homepage contract (includeRendererStyles
              // defaults false on ClientBuilderCanvas).
              <StorefrontBodyCanvas
                initialTree={blocks}
                dataSources={editCanvasRenderData.dataSources}
                sectionEmbedIslands={editCanvasRenderData.sectionEmbedIslands}
                publicPathPrefix={publicPathPrefix}
                components={{}}
                componentStyleDefaults={editCanvasRenderData.componentStyleDefaults}
              />
            ) : (
              // renderFreeformPageRootTree, NOT bare renderBuilderNodes: the
              // generic freeform path renders root `section` nodes as null, so a
              // section-rooted page (every AI-generated page, any Add-Gallery
              // custom section) rendered an EMPTY main here — published AND
              // draft. The root-tree helper wraps each root section and renders
              // its children (the fix the talent pages already use).
              renderFreeformPageRootTree(blocks, {
                publicPathPrefix,
                mode: "freeform",
                includeRendererStyles: false,
                componentStyleDefaults,
                dataSources: freeformDataSources ?? undefined,
                captcha: pageCaptcha
                  ? { provider: pageCaptcha.provider, siteKey: pageCaptcha.siteKey }
                  : null,
                // The captcha widget must render in the page's language. Both
                // providers otherwise read the visitor's BROWSER language, so a
                // Spanish storefront showed an English challenge.
                visitorLocale: locale,
                // ONE DESIGN PER PAGE — resolve each localizable string prop
                // through the node's `i18n` overlay. `defaultLocale` is the row
                // we actually loaded, so a page authored only in a secondary
                // language treats its own text as the base rather than as a
                // fallback.
                //
                // `editorPreview` (the 40% opacity + dotted "needs translation"
                // outline) is set ONLY while an authorized editor is on the
                // page. It is what makes a missing translation visible when the
                // operator switches language in the builder — and the storefront
                // body here IS the editor canvas, because the client canvas is
                // flag-gated off. A visitor never takes this branch with edit
                // mode active, so the cue cannot reach the live site.
                contentLocale: contentLocaleForDesignRow(
                  localeSettings,
                  locale,
                  freeformPage.locale,
                  { editorPreview: editorViewing },
                ),
                ...experimentContext,
                renderSectionEmbed: makeSectionEmbedRenderer({
                  tenantId: publicScope.tenantId,
                  locale,
                  publicPathPrefix,
                  previewSubject: { kind: "workspace", id: publicScope.tenantId },
                }),
              })
            )}
          </main>
          <PublicFooter />
          {mountChatLauncher ? (
            <AgencyChatLauncherMount sourcePage={launcherSourcePage} />
          ) : null}
        </>
      );
    }
  }

  // Phase 7 — section-composed snapshot (draft-first while edit/preview).
  // Empty slot arrays still render through HomepageCmsSections so brand-new
  // draft pages do not fall through to `cms_public_pages_for_tenant` (published-only).
  const sectionPage = await loadPageForRender(publicScope.tenantId, locale as Locale, slugPath);
  if (sectionPage?.snapshot) {
    return (
      <>
        <SkipToContent />
        {/* ANALYTICS-2 — storefront page-view (section-composed CMS page). */}
        <SitePageViewAnalytics
          surface="storefront"
          tenantId={publicScope.tenantId}
          pageSlug={slugPath}
          locale={locale}
        />
        <JsonLdScript script={jsonLdScript} />
        <PublicHeader />
        <main id="main-content" className="w-full flex-1">
          <HomepageCmsSections
            snapshot={sectionPage.snapshot}
            tenantId={publicScope.tenantId}
            locale={locale}
          />
        </main>
        <PublicFooter />
        {mountChatLauncher ? (
          <AgencyChatLauncherMount sourcePage={launcherSourcePage} />
        ) : null}
      </>
    );
  }

  const { data } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("title,body,template_key")
    .eq("locale", locale)
    .eq("slug", slugPath)
    .maybeSingle();

  if (!data) notFound();

  return (
    <>
      <SkipToContent />
      {/* ANALYTICS-2 — storefront page-view (legacy published CMS page). */}
      <SitePageViewAnalytics
        surface="storefront"
        tenantId={publicScope.tenantId}
        pageSlug={slugPath}
        locale={locale}
      />
      <JsonLdScript script={jsonLdScript} />
      <PublicHeader />
      <main id="main-content" className="w-full flex-1 px-4 py-16 sm:px-6 lg:px-8">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-normal tracking-wide text-foreground">{data.title}</h1>
          <div className="prose prose-neutral mt-8 max-w-none dark:prose-invert">
            {data.body ? (
              <div className="whitespace-pre-wrap text-muted-foreground">{data.body}</div>
            ) : (
              <p className="text-muted-foreground">No body content yet.</p>
            )}
          </div>
        </article>
      </main>
      <PublicFooter />
      {mountChatLauncher ? (
        <AgencyChatLauncherMount sourcePage={launcherSourcePage} />
      ) : null}
    </>
  );
}
