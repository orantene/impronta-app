/**
 * Public renderer for a PUBLISHED freeform `talent_pages` row.
 *
 * Route: `/t/[profileCode]/[pageSlug]` — a published freeform page authored in
 * the Talent Max page builder (TalentMaxBuilderMount → talent_pages.blocks).
 *
 * Resolution:
 *   1. profileCode → talent_profiles (id + managing agency tenant), anon RLS.
 *   2. (talent_profiles.id, pageSlug) → published talent_pages row, anon RLS.
 *   3. notFound() when either is missing or the page is not `published`.
 *
 * Render:
 *   `renderFreeformPageRootTree(blocks, { mode:"freeform", styleClasses:theme,
 *     renderSectionEmbed: makeSectionEmbedRenderer({ tenantId, locale,
 *     previewSubject:{ kind:"talent", id } }) })` — the SAME freeform render
 *   path the storefront/editor use, with the section-embed preview subject set
 *   to THIS talent so connected curated sections hydrate from the talent.
 *
 * This is a NEW sibling segment under `/t/[profileCode]`; the existing profile
 * route (`/t/[profileCode]`) is untouched.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getPublicPathPrefix } from "@/lib/saas/scope";
import { loadPublishedTalentPage } from "@/lib/talent-site/published-talent-page";
import {
  renderFreeformPageRootTree,
} from "@/lib/site-admin/builder-node/freeform-page-blocks";
import {
  BuilderNodeFontLinks,
  BuilderNodeRendererStyles,
  hasRenderableBuilderNodes,
} from "@/lib/site-admin/builder-node/render";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { loadBuilderNodeDataSources } from "@/components/home/homepage-cms-data-sources";
import { loadBuilderComponentsForTenant } from "@/lib/site-admin/edit-mode/builder-components-loader";
import { loadPublicComponentStyleDefaults } from "@/lib/site-admin/server/reads";
import { treeHasInstances } from "@/lib/site-admin/builder-node/component-instances";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";
import { GoogleFontsLink } from "@/app/google-fonts-link";
import { PublicHeader } from "@/components/public-header";

// A published talent page must reflect the talent's latest publish — mirror the
// profile route's caching contract so newly-published edits are never stale.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ profileCode: string; pageSlug: string }>;
}): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const { profileCode, pageSlug } = await params;
  const page = await loadPublishedTalentPage({ profileCode, slug: pageSlug });
  if (!page) return { title: "Not found" };
  return { title: page.title };
}

export default async function PublicTalentFreeformPage({
  params,
}: {
  params: Promise<{ profileCode: string; pageSlug: string }>;
}) {
  if (!isSupabaseConfigured()) notFound();

  const { profileCode, pageSlug } = await params;
  const [locale, publicPathPrefix] = await Promise.all([
    getRequestLocale(),
    getPublicPathPrefix(),
  ]);

  const page = await loadPublishedTalentPage({ profileCode, slug: pageSlug });
  if (!page) notFound();

  const {
    blocks,
    theme,
    tenantId,
    talentProfileId,
    designTokens,
    componentStyleDefaults: talentComponentStyleDefaults,
  } = page;

  if (!hasRenderableBuilderNodes(blocks, { mode: "freeform" })) {
    // A published-but-empty page has nothing to show — treat as not found
    // rather than rendering a blank document.
    notFound();
  }

  // Curated section_embed nodes need a tenant render context. The managing
  // agency tenant scopes credentials/host; previewSubject points the curated
  // sections at THIS talent so connected data hydrates from the talent, not the
  // host tenant. When the talent has no managing tenant, section embeds fall
  // back to their "connects on publish" placeholder (no tenant context).
  const renderSectionEmbed = tenantId
    ? makeSectionEmbedRenderer({
        tenantId,
        locale,
        publicPathPrefix,
        previewSubject: { kind: "talent", id: talentProfileId, locale },
      })
    : null;

  // Data sources (bound media, collections, directory) + live component
  // instances — only load when the tree actually binds them AND a managing
  // tenant exists (the loaders are tenant-scoped service-role reads).
  const [dataSources, components, tenantComponentStyleDefaults] = await Promise.all([
    tenantId
      ? loadBuilderNodeDataSources(blocks, tenantId, locale)
      : Promise.resolve({}),
    tenantId && treeHasInstances(blocks)
      ? loadBuilderComponentsForTenant(tenantId)
      : Promise.resolve({}),
    tenantId
      ? loadPublicComponentStyleDefaults(tenantId)
      : Promise.resolve({}),
  ]);

  // Talent-scoped theme cascade: the talent's OWN published per-component-type
  // defaults take precedence over the managing tenant's when the talent has set
  // any (theme = talent self-expression); otherwise inherit the tenant defaults.
  const componentStyleDefaults =
    talentComponentStyleDefaults && Object.keys(talentComponentStyleDefaults).length > 0
      ? talentComponentStyleDefaults
      : tenantComponentStyleDefaults;

  // Talent-scoped design tokens. When the talent has themed their page, project
  // their LIVE tokens as CSS vars + data-attrs on a `data-theme-canvas-root`
  // wrapper. Every bound node renders `var(--token-x, fallback)`, so setting the
  // vars on this ancestor overrides the host tenant's tokens (inherited from
  // <html>) for this subtree — the SAME projection the storefront + editor use.
  const hasTalentTokens = Object.keys(designTokens).length > 0;
  const talentCssVars = hasTalentTokens ? designTokensToCssVars(designTokens) : {};
  // Custom font families consume `--site-heading/body-font` (declared on <html>);
  // override them on the canvas root too when a custom family is set.
  const headingFamily = designTokens["typography.heading-font-family"]?.trim();
  const bodyFamily = designTokens["typography.body-font-family"]?.trim();
  if (headingFamily) talentCssVars["--site-heading-font"] = headingFamily;
  if (bodyFamily) talentCssVars["--site-body-font"] = bodyFamily;
  const talentDataAttrs = hasTalentTokens ? designTokensToDataAttrs(designTokens) : {};

  return (
    <div data-talent-freeform-page-shell="">
      <PublicHeader />
      {/* Renderer styles + fonts emitted once at the page level; the root-tree
          helper sets includeRendererStyles/includeFontLinks=false per block. */}
      <BuilderNodeRendererStyles />
      <BuilderNodeFontLinks nodes={blocks} components={components} />
      {/* Load any Google fonts the talent picked in their theme. No-op when no
          picker tokens are set. */}
      {hasTalentTokens ? <GoogleFontsLink tokens={designTokens} /> : null}
      <main
        data-talent-freeform-page-main=""
        data-theme-canvas-root=""
        {...talentDataAttrs}
        style={talentCssVars as React.CSSProperties}
      >
        {renderFreeformPageRootTree(blocks, {
          publicPathPrefix,
          mode: "freeform",
          includeRendererStyles: false,
          styleClasses: theme,
          dataSources,
          components,
          componentStyleDefaults,
          renderSectionEmbed,
        })}
      </main>
    </div>
  );
}
