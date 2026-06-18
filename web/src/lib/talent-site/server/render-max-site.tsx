import "server-only";

import type { ReactNode } from "react";

import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { SitePageViewAnalytics } from "@/components/analytics/site-page-view-analytics";

import {
  BuilderNodeFontLinks,
  BuilderNodeRendererStyles,
  collectPresentNodeKinds,
  hasRenderableBuilderNodes,
  renderBuilderNodes,
  renderFreeformPageRootTree,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import { treeHasInstances } from "@/lib/site-admin/builder-node/component-instances";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { resolveExperimentRenderContext } from "@/lib/site-admin/builder-node/experiment-context";
import {
  coerceTheme,
  type PublishedTalentPageRenderData,
} from "@/lib/talent-site/published-talent-page-core";
import { readTalentDesignSlice } from "@/lib/site-admin/edit-mode/talent-design-store";
import { loadBuilderNodeDataSources } from "@/components/home/homepage-cms-data-sources";
import { loadBuilderComponentsForTenant } from "@/lib/site-admin/edit-mode/builder-components-loader";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";
import { GoogleFontsLink } from "@/app/google-fonts-link";
import { getCachedActorSession } from "@/lib/server/request-cache";

import {
  buildMaxSiteNav,
  coerceTree,
  hydrateShellNav,
  maxSitePublicGate,
  selectMaxSitePage,
  type MaxSiteRow,
  type MaxSitePageRow,
} from "@/lib/talent-site/resolve-max-site-core";
import { buildTalentProfileJsonLd } from "@/lib/seo/talent-json-ld";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";

import {
  loadMaxSiteByProfileId,
  loadMaxSiteBySlug,
  loadMaxSitePages,
  loadTalentManagingTenantId,
  loadTalentOwnerUserId,
  loadTalentPlanKey,
  loadTalentSiteIdentity,
  type TalentSiteIdentity,
} from "./load-max-site";

/**
 * Talent Max Site — REUSABLE public render.
 *
 * `renderTalentMaxSite()` resolves a talent's Max site (by `siteSlug` OR
 * `talentProfileId` — the latter for the sibling's custom-domain flow), plan-
 * and publish-gates it, picks the requested page, and renders the page's
 * freeform `blocks` tree INSIDE the talent's own SHELL (the `shell_published`
 * header/footer/logo tree, with the site's pages injected as nav). The page body
 * reuses the SAME freeform render path as `/t/[code]/[slug]`
 * (`renderFreeformPageRootTree`) — it does NOT reimplement any node.
 *
 * Returns a discriminated result so the route page can map `not_found` → 404
 * without this function importing `next/navigation`:
 *   - `{ kind: "render", node, seo }` — paint `node`; apply `seo` in metadata.
 *   - `{ kind: "not_found" }` — 404 (missing site/page, closed gate, empty page).
 *
 * NEVER throws to the visitor — every resolution miss degrades to `not_found`.
 */

export interface RenderTalentMaxSiteInput {
  /** Resolve the site by its globally-unique slug (the /t/site/<slug> path). */
  siteSlug?: string;
  /** OR resolve by talent profile id (the sibling's custom-domain host flow). */
  talentProfileId?: string;
  /** The page within the site; omitted → the home page. */
  pageSlug?: string | null;
  /** The visitor's resolved locale (drives section-embed + font loading). */
  locale: string;
  /** Locale path prefix (e.g. "/es") for hrefs. */
  publicPathPrefix?: string;
  /** Owner draft preview (`?preview=draft`). Renders draft shell + draft pages. */
  previewDraft?: boolean;
  /**
   * SEO-2 — the absolute origin this page is served from, for the canonical URL.
   * `/t/site/[siteSlug]` routes pass the app origin (NEXT_PUBLIC_SITE_URL); the
   * custom-domain catch-all passes the apex host (so the canonical points at the
   * talent's OWN domain, never the discovery profile). Falls back to
   * NEXT_PUBLIC_SITE_URL when omitted.
   */
  canonicalOrigin?: string;
  /**
   * SEO-2 — the path (origin-relative, leading slash) this page is served at,
   * used to build the default canonical when the page has no explicit
   * `canonical_url`. Routes pass their own path (`/t/site/<slug>[/<page>]`, or
   * `/[<page>]` for a custom-domain apex).
   */
  canonicalPath?: string;
}

/**
 * SEO-1 — the talent-site SEO envelope, widened to the SAME field set the
 * cms_pages-backed metadata carries (title/description/OG/canonical/noindex +
 * JSON-LD). This is the shared contract the 3 talent-site routes destructure;
 * SEO-2 populates these from the SEO-1 `talent_pages` columns (meta_description,
 * og_*, canonical_url, noindex, json_ld). Every added field is OPTIONAL so a
 * not-yet-migrated read degrades to undefined and never throws.
 */
export interface MaxSiteSeo {
  title: string;
  description?: string;
  /** Set on the draft preview so a preview is never indexed. */
  noindex: boolean;
  /** og:title — falls back to `title` when absent. */
  ogTitle?: string;
  /** og:description — falls back to `description` when absent. */
  ogDescription?: string;
  /** Absolute og:image URL for the page. */
  ogImageUrl?: string;
  /** Absolute canonical URL for THIS site page (never the /t/[code] profile). */
  canonical?: string;
  /** Structured-data (JSON-LD) document emitted in a `<script type="application/ld+json">`. */
  jsonLd?: unknown;
}

export type RenderTalentMaxSiteResult =
  | { kind: "render"; node: ReactNode; seo: MaxSiteSeo }
  | { kind: "not_found" };

const NOT_FOUND: RenderTalentMaxSiteResult = { kind: "not_found" };

/**
 * Resolve the site row from either key. By-slug is the primary path; by-profile
 * is the custom-domain path. Returns null when neither key resolves a row.
 */
async function resolveSiteRow(
  input: RenderTalentMaxSiteInput,
): Promise<MaxSiteRow | null> {
  if (input.siteSlug) {
    return loadMaxSiteBySlug(input.siteSlug);
  }
  if (input.talentProfileId) {
    return loadMaxSiteByProfileId(input.talentProfileId);
  }
  return null;
}

export async function renderTalentMaxSite(
  input: RenderTalentMaxSiteInput,
): Promise<RenderTalentMaxSiteResult> {
  try {
    const site = await resolveSiteRow(input);
    if (!site || !site.siteSlug) return NOT_FOUND;

    const talentProfileId = site.talentProfileId;
    const previewDraft = input.previewDraft === true;

    // ── Owner gate for draft preview (owner-only, like the profile preview) ──
    let isOwnerDraftPreview = false;
    if (previewDraft) {
      const [session, ownerUserId] = await Promise.all([
        getCachedActorSession(),
        loadTalentOwnerUserId(talentProfileId),
      ]);
      isOwnerDraftPreview = Boolean(
        session.user && ownerUserId && session.user.id === ownerUserId,
      );
      // A non-owner who appends ?preview=draft falls through to the PUBLIC gate
      // (sees the published site, or 404) — never the draft.
    }

    // ── Plan + publish gate ─────────────────────────────────────────────────
    // The public path requires Max + a published site. The owner draft preview
    // bypasses this so the owner can preview an unpublished draft.
    const planKey = isOwnerDraftPreview
      ? null
      : await loadTalentPlanKey(talentProfileId);
    const gateOpen = maxSitePublicGate({
      sitePublishedAt: site.sitePublishedAt,
      planKey,
      isOwnerDraftPreview,
    });
    if (!gateOpen) return NOT_FOUND;

    // ── Pick the shell + page set for this view ─────────────────────────────
    const shellSource = isOwnerDraftPreview ? site.shellTree : site.shellPublished;
    const shellTree = coerceTree(shellSource);

    const pages = await loadMaxSitePages(talentProfileId);
    // Owner draft preview renders draft pages too; the public path requires
    // published (the pure core re-applies this — defense in depth over RLS).
    const requirePublished = !isOwnerDraftPreview;
    const page = selectMaxSitePage(pages, {
      pageSlug: input.pageSlug,
      requirePublished,
    });
    if (!page) return NOT_FOUND;

    const blocks = coerceTree(page.blocks);
    if (!hasRenderableBuilderNodes(blocks, { mode: "freeform" })) {
      // A published-but-empty page → 404 rather than a blank document.
      return NOT_FOUND;
    }

    // ── Build nav from the published pages (owner preview also shows drafts) ──
    const navSource: readonly MaxSitePageRow[] = requirePublished
      ? pages
      : pages.map((p) => ({ ...p, status: "published" }));
    const nav = buildMaxSiteNav(navSource);
    const publicPathPrefix = input.publicPathPrefix ?? "";
    const hydratedShell = hydrateShellNav(
      shellTree,
      nav,
      site.siteSlug,
      publicPathPrefix,
    );

    // ── Managing tenant — section-embed render context for the page body ─────
    const tenantId = await loadTalentManagingTenantId(talentProfileId);

    // ── Talent identity for the SITE's JSON-LD + OG image (degrade-safe) ──────
    const identity = await loadTalentSiteIdentity(talentProfileId);

    const node = await renderMaxSiteDocument({
      shellTree: hydratedShell,
      logoUrl: site.logoUrl,
      page,
      blocks,
      tenantId,
      talentProfileId,
      locale: input.locale,
      publicPathPrefix,
      draftPreview: isOwnerDraftPreview,
    });

    const seo = buildMaxSiteSeo({
      site,
      page,
      identity,
      locale: input.locale,
      noindex: isOwnerDraftPreview,
      canonicalOrigin: input.canonicalOrigin,
      canonicalPath: input.canonicalPath,
    });

    return { kind: "render", node, seo };
  } catch {
    // Degrade safe — any unexpected failure becomes a 404, never a throw.
    return NOT_FOUND;
  }
}

/**
 * SEO-2 — populate the widened `MaxSiteSeo` from the selected page's SEO-1
 * columns, the site row, and the talent identity.
 *
 * Canonical: prefer the page's explicit `canonical_url`; else build
 * `canonicalOrigin + canonicalPath` (the talent's OWN site/domain URL — NEVER
 * the /t/[code] discovery profile). JSON-LD: reuse the SHARED
 * `buildTalentProfileJsonLd`, passing THIS canonical so the site's structured
 * data does not conflate with the profile's. If the page stored an explicit
 * `json_ld` document, that wins (operator override). Every field degrades to
 * undefined when absent so a not-yet-populated page still renders.
 */
function buildMaxSiteSeo(args: {
  site: MaxSiteRow;
  page: MaxSitePageRow;
  identity: TalentSiteIdentity | null;
  locale: string;
  noindex: boolean;
  canonicalOrigin?: string;
  canonicalPath?: string;
}): MaxSiteSeo {
  const { site, page, identity, locale, noindex } = args;

  const title = page.title?.trim() || identity?.name || site.siteSlug || "";
  const description = page.metaDescription?.trim() || undefined;

  // Canonical — explicit column wins; else origin + path. Never the profile.
  const origin = (args.canonicalOrigin?.trim() || publicSiteMetadataBase().origin)
    .replace(/\/$/, "");
  const path = args.canonicalPath?.trim() || "/";
  const builtCanonical = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  const canonical = page.canonicalUrl?.trim() || builtCanonical;

  // JSON-LD — operator override wins; else the SHARED profile builder, keyed to
  // the SITE canonical. `name` falls back through identity → title.
  const name = identity?.name?.trim() || title;
  const sharedJsonLd =
    name && canonical
      ? buildTalentProfileJsonLd({
          canonicalUrl: canonical,
          name,
          givenName: identity?.firstName ?? null,
          familyName: identity?.lastName ?? null,
          description: description ?? page.ogDescription?.trim() ?? null,
          imageUrl: page.ogImageUrl?.trim() ?? site.logoUrl ?? null,
          inLanguage: locale,
          createdAt: identity?.createdAt ?? null,
          updatedAt: identity?.updatedAt ?? null,
        })
      : null;
  const jsonLd =
    page.jsonLd && typeof page.jsonLd === "object" ? page.jsonLd : sharedJsonLd;

  return {
    title,
    ...(description ? { description } : {}),
    noindex,
    ...(page.ogTitle?.trim() ? { ogTitle: page.ogTitle.trim() } : {}),
    ...(page.ogDescription?.trim()
      ? { ogDescription: page.ogDescription.trim() }
      : {}),
    ...(page.ogImageUrl?.trim() ? { ogImageUrl: page.ogImageUrl.trim() } : {}),
    ...(canonical ? { canonical } : {}),
    ...(jsonLd ? { jsonLd } : {}),
  };
}

/**
 * Render the full Max-site DOCUMENT: the shell header → page body → shell
 * footer, with the talent's published page theme tokens projected on a
 * `data-theme-canvas-root` so the page paints the talent's own colors (never
 * the host tenant's). Mirrors `/t/[code]/[slug]`, with the shell wrapping the
 * page in place of `PublicHeader`.
 */
async function renderMaxSiteDocument(args: {
  shellTree: BuilderNode[];
  logoUrl: string | null;
  page: MaxSitePageRow;
  blocks: BuilderNode[];
  tenantId: string | null;
  talentProfileId: string;
  locale: string;
  publicPathPrefix: string;
  draftPreview: boolean;
}): Promise<ReactNode> {
  const {
    shellTree,
    page,
    blocks,
    tenantId,
    talentProfileId,
    locale,
    publicPathPrefix,
    draftPreview,
  } = args;

  // Page-scoped theme cascade — identical to the published talent page route.
  const designSlice = readTalentDesignSlice(page.theme);
  const styleClasses = coerceTheme(page.theme);
  const designTokens = designSlice.tokens;
  const talentComponentStyleDefaults = designSlice.componentStyles;

  const renderSectionEmbed = tenantId
    ? makeSectionEmbedRenderer({
        tenantId,
        locale,
        publicPathPrefix,
        previewSubject: { kind: "talent", id: talentProfileId, locale },
      })
    : null;

  // Data sources + live components for the PAGE body (tenant-scoped). The SHELL
  // tree is the talent's own header/footer (logo/nav/copyright) — simple nodes
  // with no tenant-scoped bindings — so it renders without a data-source load.
  const [dataSources, components, platformDefault, experimentContext] =
    await Promise.all([
      tenantId
        ? loadBuilderNodeDataSources(blocks, tenantId, locale)
        : Promise.resolve({}),
      tenantId && treeHasInstances(blocks)
        ? loadBuilderComponentsForTenant(tenantId)
        : Promise.resolve({}),
      loadPlatformDefaultTheme("talent"),
      // ABTEST-1 — stable per-visitor seed for any A/B CTA/form nodes on the
      // talent's personal Max site.
      resolveExperimentRenderContext({ tenantId, surface: "talentSite" }),
    ]);

  // Unthemed talent → the PLATFORM DEFAULT (Modern light), so the page renders
  // at parity with the editor and never inherits a host tenant's dark bg.
  const componentStyleDefaults =
    talentComponentStyleDefaults &&
    Object.keys(talentComponentStyleDefaults).length > 0
      ? talentComponentStyleDefaults
      : platformDefault.componentStyles;
  const effectiveTokens =
    Object.keys(designTokens).length > 0 ? designTokens : platformDefault.tokens;
  const hasTokens = Object.keys(effectiveTokens).length > 0;
  const cssVars = hasTokens ? designTokensToCssVars(effectiveTokens) : {};
  const headingFamily = effectiveTokens["typography.heading-font-family"]?.trim();
  const bodyFamily = effectiveTokens["typography.body-font-family"]?.trim();
  if (headingFamily) cssVars["--site-heading-font"] = headingFamily;
  if (bodyFamily) cssVars["--site-body-font"] = bodyFamily;
  const dataAttrs = hasTokens ? designTokensToDataAttrs(effectiveTokens) : {};

  const hasShell = hasRenderableBuilderNodes(shellTree, { mode: "freeform" });
  const [headerTree, footerTree] = splitShell(shellTree);

  return (
    <div
      data-talent-max-site=""
      data-theme-canvas-root=""
      {...dataAttrs}
      style={{
        ...(cssVars as React.CSSProperties),
        backgroundColor: "var(--token-color-background, #ffffff)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* A11Y-2 — first focusable element on every talent Max site surface. */}
      <SkipToContent />
      {/* ANALYTICS-2 — first-party page-view for the talent Max site, feeding the
          SAME view_site_page stream + admin loader as storefront/talent-profile.
          Suppressed in the owner draft preview so previews aren't counted. */}
      {!draftPreview && tenantId ? (
        <SitePageViewAnalytics
          surface="talent-site"
          tenantId={tenantId}
          pageId={page.id}
          pageSlug={page.slug}
          locale={locale}
        />
      ) : null}
      {/* REND-2 — public render: ONE shared renderer sheet for shell + body,
          scoped to the kinds present across BOTH trees (mirrors the FontLinks
          nodes union below). Live-resolved instance kinds are included; any
          uncertainty falls back to the full sheet. */}
      <BuilderNodeRendererStyles
        kinds={collectPresentNodeKinds([...shellTree, ...blocks], components)}
      />
      <BuilderNodeFontLinks nodes={[...shellTree, ...blocks]} components={components} />
      {hasTokens ? <GoogleFontsLink tokens={effectiveTokens} /> : null}

      {draftPreview ? (
        <div
          data-talent-max-site-draft-banner=""
          style={{
            background: "rgba(180, 83, 9, 0.12)",
            color: "#92400e",
            fontSize: 12,
            padding: "8px 16px",
            textAlign: "center",
            fontFamily: '"Inter", system-ui, sans-serif',
          }}
        >
          Draft preview — visitors see the published version until you publish
          again.
        </div>
      ) : null}

      {hasShell && headerTree.length > 0 ? (
        <header data-talent-max-site-header="">
          {renderBuilderNodes(headerTree, {
            publicPathPrefix,
            mode: "freeform",
            includeRendererStyles: false,
            includeFontLinks: false,
            renderSectionEmbed,
          })}
        </header>
      ) : null}

      <main id="main-content" data-talent-max-site-main="" style={{ flex: "1 0 auto" }}>
        {renderFreeformPageRootTree(blocks, {
          publicPathPrefix,
          mode: "freeform",
          includeRendererStyles: false,
          includeFontLinks: false,
          styleClasses,
          dataSources,
          components,
          componentStyleDefaults,
          ...experimentContext,
          renderSectionEmbed,
        })}
      </main>

      {hasShell && footerTree.length > 0 ? (
        <footer data-talent-max-site-footer="">
          {renderBuilderNodes(footerTree, {
            publicPathPrefix,
            mode: "freeform",
            includeRendererStyles: false,
            includeFontLinks: false,
            renderSectionEmbed,
          })}
        </footer>
      ) : null}
    </div>
  );
}

/**
 * Split the shell tree into HEADER and FOOTER node sets. The default shell
 * (`buildDefaultShellTree`) emits exactly two roots — a header container then a
 * footer container, distinguished by `props.layerLabel`. We honor that label
 * when present; otherwise the FIRST root is the header and the LAST is the
 * footer (any middle roots ride with the header). A single-root shell renders
 * entirely as the header (no footer), which is harmless. Pure + degrade-safe.
 */
function splitShell(shellTree: BuilderNode[]): [BuilderNode[], BuilderNode[]] {
  if (shellTree.length === 0) return [[], []];

  const labelOf = (n: BuilderNode): string =>
    String((n.props as { layerLabel?: unknown })?.layerLabel ?? "").toLowerCase();

  const footerByLabel = shellTree.filter((n) => labelOf(n).includes("footer"));
  if (footerByLabel.length > 0) {
    const footerSet = new Set(footerByLabel);
    const header = shellTree.filter((n) => !footerSet.has(n));
    return [header, footerByLabel];
  }

  if (shellTree.length === 1) return [shellTree, []];
  const header = shellTree.slice(0, shellTree.length - 1);
  const footer = shellTree.slice(shellTree.length - 1);
  return [header, footer];
}

// Re-export the published-page render data type for any caller that wants the
// shared shape (avoids a separate import path).
export type { PublishedTalentPageRenderData };
