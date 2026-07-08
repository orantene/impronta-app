import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { SitePageViewAnalytics } from "@/components/analytics/site-page-view-analytics";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { slugPathFromParams } from "@/lib/cms/paths";
import { getRequestLocale } from "@/i18n/request-locale";
import type { Locale } from "@/i18n/config";
import { buildPublicLocaleAlternates } from "@/lib/seo/locale-alternates";
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
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { isPreviewActiveForTenant } from "@/lib/site-admin/server/homepage-reads";
import { requireStaff } from "@/lib/server/action-guards";
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
  const { data } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select(metaCols)
    .eq("locale", locale)
    .eq("slug", slugPath)
    .maybeSingle();

  let page = data as CmsPagePublic | null;
  // Draft metadata for staff/preview viewers — mirrors the page body's
  // draft-reader gate so an unpublished draft doesn't tab-title as "Not found"
  // for the person editing it. Anonymous visitors still get "Not found".
  if (!page) {
    const draftReader =
      (await isPreviewActiveForTenant(publicScope.tenantId)) || (await requireStaff()).ok;
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

  const pathnameEn = `/p/${slugPath}`;
  const alt = buildPublicLocaleAlternates(locale as Locale, pathnameEn);
  const title = page.meta_title?.trim() || page.title;
  const description = page.meta_description?.trim() || undefined;
  const openGraph = {
    title: page.og_title?.trim() || title,
    description: page.og_description?.trim() || description,
    ...(page.og_image_url ? { images: [{ url: page.og_image_url }] } : {}),
  };

  const canonical = page.canonical_url?.trim();
  const altLinks = alt.alternates ?? {};

  return {
    metadataBase: alt.metadataBase,
    title,
    description,
    robots: page.noindex ? { index: false, follow: true } : undefined,
    alternates: {
      canonical: canonical || altLinks.canonical,
      languages: altLinks.languages,
    },
    openGraph,
  };
}

export default async function CmsPublicPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug: slugParam } = await params;
  const slugPath = slugPathFromParams(slugParam);
  if (!slugPath) notFound();

  const locale = await getRequestLocale();
  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  const publicScope = await getPublicTenantScope();
  if (!publicScope) notFound();

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
    const freeformCols = "id, title, blocks, is_freeform, status";
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
      .eq("locale", locale)
      .eq("slug", slugPath)
      .eq("is_freeform", true)
      // Defense-in-depth: system-owned pages (homepage, __site_shell__,
      // __directory__) are NEVER freeform — exclude them explicitly so a row
      // mis-flagged is_freeform=true can never render through this clause
      // (don't rely solely on the slug "__" prefix heuristic upstream).
      .eq("is_system_owned", false)
      .maybeSingle()
      .returns<{ id: string; title: string; blocks: BuilderNode[]; is_freeform: boolean; status: string }>();
    let freeformPage = publishedRead.data;
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
      draftReaderActive = (await requireStaff()).ok;
    }
    if (!freeformErr && !freeformPage && draftReaderActive) {
      const draftRead = await supabase
        .from("cms_pages")
        .select(freeformCols)
        .eq("tenant_id", publicScope.tenantId)
        .eq("locale", locale)
        .eq("slug", slugPath)
        .eq("is_freeform", true)
        .eq("is_system_owned", false)
        .maybeSingle()
        .returns<{ id: string; title: string; blocks: BuilderNode[]; is_freeform: boolean; status: string }>();
      freeformPage = draftRead.data;
      freeformErr = draftRead.error;
    }
    if (
      !freeformErr &&
      freeformPage?.is_freeform &&
      (freeformPage.status === "published" || draftReaderActive)
    ) {
      const blocks = (freeformPage.blocks ?? []) as BuilderNode[];
      const publicPathPrefix = await getPublicPathPrefix();
      const componentStyleDefaults = await loadPublicComponentStyleDefaults(
        publicScope.tenantId,
      );
      // ABTEST-1 — stable per-visitor seed + tenant/surface tags for any A/B
      // CTA/form nodes on this storefront page.
      const experimentContext = await resolveExperimentRenderContext({
        tenantId: publicScope.tenantId,
        surface: "adminWorkspace",
      });
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
          <BuilderNodeRendererStyles kinds={collectPresentNodeKinds(blocks)} />
          <BuilderNodeFontLinks nodes={blocks} />
          <main id="main-content" className="w-full flex-1" data-theme-canvas-root="">
            {/* renderFreeformPageRootTree, NOT bare renderBuilderNodes: the
                generic freeform path renders root `section` nodes as null, so a
                section-rooted page (every AI-generated page, any Add-Gallery
                custom section) rendered an EMPTY main here — published AND
                draft. The root-tree helper wraps each root section and renders
                its children (the fix the talent pages already use). */}
            {renderFreeformPageRootTree(blocks, {
              publicPathPrefix,
              mode: "freeform",
              includeRendererStyles: false,
              componentStyleDefaults,
              ...experimentContext,
              renderSectionEmbed: makeSectionEmbedRenderer({
                tenantId: publicScope.tenantId,
                locale,
                publicPathPrefix,
                previewSubject: { kind: "workspace", id: publicScope.tenantId },
              }),
            })}
          </main>
          <PublicFooter />
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
    </>
  );
}
