import "server-only";

import type { ReactNode } from "react";
import { loadMaxSiteIsDemo, MaxSiteDemoFooter, MaxSiteDemoPill, withHeaderSiteChrome } from "./render-max-site-demo";
import { splitShell } from "./render-max-site-shell";
import { builderTreeHasFaqBind, builderTreeHasKind } from "./builder-tree-has-kind";

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
  type BuilderNodeRenderDataSources,
} from "@/lib/site-admin/builder-node";
import { treeHasInstances } from "@/lib/site-admin/builder-node/component-instances";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import { localiseTalentHeaderDefaults } from "@/lib/talent-site/header-cta-locale";
import { prepareTalentSiteTrees, readableButtonDefaults } from "./talent-site-render-fixups.server";
import { HeaderScrollObserver } from "@/lib/site-admin/sections/site_header/HeaderScrollObserver";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { resolveExperimentRenderContext } from "@/lib/site-admin/builder-node/experiment-context";
import {
  coerceTheme,
  type PublishedTalentPageRenderData,
} from "@/lib/talent-site/published-talent-page-core";
import { readTalentDesignSlice } from "@/lib/site-admin/edit-mode/talent-design-store";
import {
  loadBuilderNodeDataSources,
  loadPersonalMaxNativeSources,
} from "@/components/home/homepage-cms-data-sources";
import { loadBuilderComponentsForTenant } from "@/lib/site-admin/edit-mode/builder-components-loader";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { isPlatformCheckoutReady } from "@/lib/talent/online-collect-ready";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";
import { GoogleFontsLink } from "@/app/google-fonts-link";
import { TypeSystemStyle } from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";
import { designTokenDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";
import { typeSystemComponentStyleDefaults } from "@/lib/talent-site/theme-catalog/collection/design-type-system";
import { getCachedActorSession } from "@/lib/server/request-cache";

import {
  buildMaxSiteNav,
  coerceTree,
  hydrateShellNav,
  maxSitePublicGate,
  scopeMaxSitePagesToPlan,
  selectMaxSitePage,
  type MaxSiteRow,
  type MaxSitePageRow,
} from "@/lib/talent-site/resolve-max-site-core";
import { talentPlanGrantsSiteCapability } from "@/lib/access/talent-membership";
import { scrubTalentSiteSeo } from "@/lib/talent-site/free-site-seo";
import {
  talentSiteBadgeLabel,
  talentSiteShowsPlatformBadge,
} from "@/lib/talent-site/free-site-badge";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";
import { pruneUnconfirmedGuestStubs } from "@/lib/talent-site/prune-unconfirmed-guest-stubs";
import { publicPageBody } from "@/lib/talent-site/talent-page-publish-core";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";

import {
  loadMaxSiteByProfileId,
  loadMaxSiteBySlug,
  loadMaxSitePages,
  loadMaxSiteThemeTokens, loadMaxSiteDesignSlug,
  loadTalentManagingTenantId,
  loadTalentOwnerUserId,
  loadTalentPlanKey,
  loadTalentSiteCtaMode,
  loadTalentSiteIdentity,
} from "./load-max-site";
import { buildMaxSiteSeo } from "./max-site-seo.server";
import { loadTalentSiteLocaleContext, type TalentSiteLocaleContext } from "./talent-site-locale.server";
import { loadUsdRatesForSitePrices } from "./vanity-usd-rates"; import { loadTalentSocialLinks } from "./talent-social-links";

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
  /**
   * How the site's own nav links are addressed. The `/t/site/[siteSlug]` routes
   * keep "path" (the default). The `_talent-site` HOST route passes "host-root",
   * because on a talent host the site IS the root: a `/t/site/<slug>/<page>`
   * href there is a 3-segment path, which `isTalentSiteHostPathAllowed` rejects,
   * so every inner nav link 404s. Default preserved so no existing caller moves.
   */
  hrefMode?: "path" | "host-root";
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
  /** True on the draft preview (never indexed) or when the page's own
   *  `talent_pages.noindex` column is set. */
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
  /** PR 5 — canonical + hreflang (two or more talent languages only). */
  alternates?: { canonical: string; languages: Record<string, string> };
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
    // The talent's own languages: bounds the locale, feeds the header switch,
    // the builder `node.i18n` overlays and the hreflang set (PR 4 + 5).
    const localeCtx = await loadTalentSiteLocaleContext({ talentProfileId, requestedLocale: input.locale, hrefMode: input.hrefMode, pagePath: input.canonicalPath });
    const locale = localeCtx.locale;

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
    // The public path requires `personalSitePublish` + a published site. The
    // owner draft preview bypasses the gate so the owner can preview an
    // unpublished draft — but the plan is still READ there, because read-time
    // SEO scoping below needs it on both paths.
    const planKey = await loadTalentPlanKey(talentProfileId);
    const ctaMode = await loadTalentSiteCtaMode(talentProfileId, planKey); // seeded CTA copy follows booking mode
    const gateOpen = maxSitePublicGate({
      sitePublishedAt: site.sitePublishedAt,
      planKey,
      isOwnerDraftPreview,
    });
    if (!gateOpen) return NOT_FOUND;

    // ── Pick the shell + page set for this view ─────────────────────────────
    const shellSource = isOwnerDraftPreview ? site.shellTree : site.shellPublished;
    const shellTree = coerceTree(shellSource);

    const allPages = await loadMaxSitePages(talentProfileId);
    // PHASE 1 — read-time page scoping. Extra pages are Web Office: a talent
    // without `personalSitePages` serves HOME ONLY on the public path, while
    // every row stays in the database. The owner's draft preview is never
    // scoped — they always see their whole site.
    const pages = isOwnerDraftPreview
      ? allPages
      : scopeMaxSitePagesToPlan(allPages, planKey);
    // Owner draft preview renders draft pages too; the public path requires
    // published (the pure core re-applies this — defense in depth over RLS).
    const requirePublished = !isOwnerDraftPreview;
    const page = selectMaxSitePage(pages, {
      pageSlug: input.pageSlug,
      requirePublished,
    });
    if (!page) return NOT_FOUND;

    // Guest: published body; scrub unconfirmed social stubs; localise seeded labels.
    const body = coerceTree(publicPageBody(page, { draftPreview: isOwnerDraftPreview }));
    const fixed = await prepareTalentSiteTrees({ talentProfileId, locale, chain: localeCtx.chain, logoUrl: site.logoUrl, shellTree, body, ctaMode });
    const blocks = pruneUnconfirmedGuestStubs(fixed.body);
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
      fixed.shellTree,
      nav,
      site.siteSlug,
      publicPathPrefix,
      input.hrefMode ?? "path",
    );

    // ── Managing tenant — section-embed render context for the page body ─────
    const tenantId = await loadTalentManagingTenantId(talentProfileId);

    // ── Talent identity for the SITE's JSON-LD + OG image (degrade-safe) ──────
    const identity = await loadTalentSiteIdentity(talentProfileId);

    // ── Demo talent (fictional theme example): Demo pill + footer line ──────
    const isDemo = await loadMaxSiteIsDemo(talentProfileId);

    // Site theme tokens + Design slug (token defaults).
    const siteTokens = await loadMaxSiteThemeTokens(talentProfileId, { draft: isOwnerDraftPreview });
    const designSlug = await loadMaxSiteDesignSlug(talentProfileId);

    const node = await renderMaxSiteDocument({
      siteTokens,
      designSlug,
      shellTree: hydratedShell,
      logoUrl: site.logoUrl,
      page,
      blocks,
      tenantId,
      talentProfileId,
      locale,
      localeCtx,
      publicPathPrefix,
      draftPreview: isOwnerDraftPreview,
      // PHASE 1 — a free site carries the "Made with Tulala" mark; a paid plan
      // removes it (same predicate as the /t/[code] profile footer).
      showPlatformBadge: talentSiteShowsPlatformBadge(planKey),
      isDemo,
    });

    const seo = buildMaxSiteSeo({
      site,
      // PHASE 1 — SEO is Web Office. A talent without `personalSiteSeo` renders
      // with their stored SEO IGNORED (never deleted), so a lapsed Web Office
      // talent's overrides simply stop applying and come back on restore.
      page: scrubTalentSiteSeo(
        page,
        talentPlanGrantsSiteCapability(planKey, "personalSiteSeo"),
      ),
      identity,
      locale,
      noindex: isOwnerDraftPreview,
      canonicalOrigin: input.canonicalOrigin,
      canonicalPath: input.canonicalPath,
      locales: { primary: localeCtx.settings.defaultLocale, urlDefault: localeCtx.grammar.defaultLocale, supported: localeCtx.settings.supportedLocales },
    });

    return { kind: "render", node, seo };
  } catch {
    // Degrade safe — any unexpected failure becomes a 404, never a throw.
    return NOT_FOUND;
  }
}

/**
 * Render the full Max-site DOCUMENT: the shell header → page body → shell
 * footer, with the talent's published page theme tokens projected on a
 * `data-theme-canvas-root` so the page paints the talent's own colors (never
 * the host tenant's). Mirrors `/t/[code]/[slug]`, with the shell wrapping the
 * page in place of `PublicHeader`.
 */
async function renderMaxSiteDocument(args: {
  /** Site-level theme tokens (theme gallery); `{}` = today's cascade. */
  siteTokens: Readonly<Record<string, string>>;
  designSlug?: string | null;
  shellTree: BuilderNode[];
  logoUrl: string | null;
  page: MaxSitePageRow;
  blocks: BuilderNode[];
  tenantId: string | null;
  talentProfileId: string;
  locale: string;
  /** The talent's languages: switcher, overlays (talent-site-locale.server). */
  localeCtx: TalentSiteLocaleContext;
  publicPathPrefix: string;
  draftPreview: boolean;
  /** PHASE 1 — render the "Made with Tulala" footer mark (free sites only). */
  showPlatformBadge: boolean;
  /** Fictional demo talent: a Demo pill above the header + a footer line. */
  isDemo?: boolean;
}): Promise<ReactNode> {
  const {
    siteTokens,
    shellTree,
    page,
    blocks,
    tenantId,
    talentProfileId,
    locale,
    publicPathPrefix,
    draftPreview,
    showPlatformBadge,
  } = args;

  // Page-scoped theme cascade — identical to the published talent page route.
  const designSlice = readTalentDesignSlice(page.theme);
  const styleClasses = coerceTheme(page.theme);
  const designTokens = designSlice.tokens;
  const talentComponentStyleDefaults = designSlice.componentStyles;

  // Captcha for native `form` nodes AND live `services_catalog` booking.
  // /api/cms/forms/submit and createInstantBookingAction both enforce captcha
  // per TENANT — a Max site that rendered no widget silently rejected every
  // submission / confirm once a provider was configured (improntamodels
  // 2026-08-16; book-jorgelina catalog sheet 2026-09-25). Gated on the tree
  // actually containing a form or services_catalog so pages without one pay
  // no query. Live catalog booking also needs the site key whenever the
  // vanity host is not a draft preview (catalogBookingLive below).
  const pageNeedsCaptcha = (function needsCaptcha(nodes: unknown): boolean {
    if (Array.isArray(nodes)) return nodes.some(needsCaptcha);
    if (!nodes || typeof nodes !== "object") return false;
    const n = nodes as { kind?: unknown; children?: unknown };
    return n.kind === "form" || n.kind === "services_catalog" || needsCaptcha(n.children);
  })([shellTree, blocks]);

  // Data sources + live components for the PAGE body (tenant-scoped). The SHELL
  // tree is the talent's own header/footer (logo/nav/copyright) — simple nodes
  // with no tenant-scoped bindings — so it renders without a data-source load.
  //
  // Exception: unrostered / free personal Max sites have `tenantId === null`,
  // which used to skip data sources entirely. Hablar/dock still loaded
  // offerings, but `services_catalog` rendered the empty state. Load catalog
  // sources by talent profile whenever the page tree needs them.
  const pageNeedsServicesCatalog = builderTreeHasKind(blocks, "services_catalog");
  const pageNeedsPortfolio = builderTreeHasKind(blocks, "portfolio");
  const pageNeedsReviews = builderTreeHasKind(blocks, "reviews");
  const pageNeedsVisit = builderTreeHasKind(blocks, "visit");
  const pageNeedsCompCard = builderTreeHasKind(blocks, "comp_card");
  const pageNeedsFaq = builderTreeHasFaqBind(blocks);
  const pageNeedsNextFreeChip = builderTreeHasKind(blocks, "next_free_chip");
  const pageNeedsTalentOfferings =
    pageNeedsServicesCatalog || pageNeedsPortfolio || pageNeedsNextFreeChip;

  // Codex P2 / ACCEPTANCE: loading offerings with catalogBookingLive=false mounts
  // demo booking ("Preview: no real bookings") on published free vanity. Own-work
  // Path A / inquiry uses the platform hub when there is no managing agency
  // tenant — same as Agenda `resolveTalentOwnWorkTenant` / Path B hub pick.
  let bookingTenantId: string | null = tenantId;
  if (!bookingTenantId && !draftPreview && pageNeedsTalentOfferings) {
    bookingTenantId = (await getPlatformHubTenant())?.tenantId ?? null;
  }
  const catalogBookingLive = Boolean(bookingTenantId) && !draftPreview;
  // Published vanity with a booking tenant always runs catalogBookingLive —
  // resolve captcha even if the tree scan missed a nested catalog.
  const resolveCaptcha = Boolean(bookingTenantId) && (pageNeedsCaptcha || !draftPreview);

  const [dataSources, components, platformDefault, experimentContext, pageCaptcha, talentOfferings] =
    await Promise.all([
      tenantId
        ? loadBuilderNodeDataSources(blocks, tenantId, locale, null, talentProfileId)
        : pageNeedsTalentOfferings || pageNeedsReviews || pageNeedsVisit || pageNeedsCompCard || pageNeedsFaq
          ? loadPersonalMaxNativeSources({
              talentProfileId,
              locale,
              servicesCatalog: pageNeedsServicesCatalog,
              portfolio: pageNeedsPortfolio,
              nextFreeChip: pageNeedsNextFreeChip,
              reviews: pageNeedsReviews,
              visit: pageNeedsVisit,
              compCard: pageNeedsCompCard,
              talentFaq: pageNeedsFaq,
            })
          : Promise.resolve({} as BuilderNodeRenderDataSources),
      tenantId && treeHasInstances(blocks)
        ? loadBuilderComponentsForTenant(tenantId)
        : Promise.resolve({}),
      loadPlatformDefaultTheme("talent"),
      // ABTEST-1 — stable per-visitor seed for any A/B CTA/form nodes on the
      // talent's personal Max site.
      resolveExperimentRenderContext({ tenantId, surface: "talentSite" }),
      resolveCaptcha && bookingTenantId
        ? resolveTenantCaptcha(bookingTenantId)
        : Promise.resolve(null),
      // D-MSG-421 — vanity hosts never went through profile-storefront-payload,
      // so peso prices printed with no ≈ US$ line. Tenant stays null: this is
      // the talent's own site, not an agency storefront.
      loadPublicOfferingsForProfile(talentProfileId, locale, null),
    ]);
  const usdRates = await loadUsdRatesForSitePrices([
    ...talentOfferings,
    ...(dataSources.menuOfferings ?? []),
  ]);
  // D-MSG-421 loads offerings for the talent vanity even when there is no
  // agency `tenantId` (so `loadBuilderNodeDataSources` is skipped). Merge them
  // onto the render dataSources — otherwise `services_catalog` always renders
  // the empty state on solo talent sites.
  const pricedDataSources = {
    ...dataSources,
    talentOfferings:
      Array.isArray(dataSources.talentOfferings) && dataSources.talentOfferings.length > 0
        ? dataSources.talentOfferings
        : talentOfferings,
    usdRates,
    // Booking sheet / purchase mount need the hub (or agency) tenant id even
    // when the Max site itself has no managing agency.
    tenantId: dataSources.tenantId ?? bookingTenantId ?? undefined,
    catalogBookingLive,
    onlineCollectReady: isPlatformCheckoutReady(),
  };

  const captchaConfig = pageCaptcha
    ? { provider: pageCaptcha.provider, siteKey: pageCaptcha.siteKey }
    : null;

  const renderSectionEmbed = tenantId
    ? makeSectionEmbedRenderer({
        tenantId,
        locale,
        publicPathPrefix,
        previewSubject: { kind: "talent", id: talentProfileId, locale },
        captcha: captchaConfig,
      })
    : null;

  const effectiveTokens = resolveEffectiveSiteTokens(
    designTokens,
    siteTokens,
    platformDefault.tokens,
    designTokenDefaults(args.designSlug),
  );
  const componentStyleDefaults =
    talentComponentStyleDefaults && Object.keys(talentComponentStyleDefaults).length > 0
      ? talentComponentStyleDefaults
      : typeSystemComponentStyleDefaults(effectiveTokens, platformDefault.componentStyles);
  const hasTokens = Object.keys(effectiveTokens).length > 0;
  const cssVars = hasTokens ? designTokensToCssVars(effectiveTokens) : {};
  const headingFamily = effectiveTokens["typography.heading-font-family"]?.trim();
  const bodyFamily = effectiveTokens["typography.body-font-family"]?.trim();
  if (headingFamily) cssVars["--site-heading-font"] = headingFamily;
  if (bodyFamily) cssVars["--site-body-font"] = bodyFamily;
  const dataAttrs = hasTokens ? designTokensToDataAttrs(effectiveTokens) : {};

  const hasShell = hasRenderableBuilderNodes(shellTree, { mode: "freeform" });
  const [headerTree, footerTree] = splitShell(shellTree); const footerSocialLinks = builderTreeHasKind(footerTree, "social_links") ? await loadTalentSocialLinks(talentProfileId) : [];

  // Render one shell root. A `site_header`/`site_footer` SECTION LANDMARK carries
  // its config inline (`props.sectionProps`) and is rendered via the bespoke
  // section Component (the freeform renderer returns null for `kind:"section"`),
  // then its freeform children. Any other root renders as freeform as before.
  // This is the talent-scoped port of PublishedShell.renderShellSlot — it does
  // NOT route through the agency `site-shell-flag` path.
  const renderShellRoot = (root: BuilderNode): ReactNode => {
    if (
      root.kind === "section" &&
      (root.props.sectionTypeKey === "site_header" ||
        root.props.sectionTypeKey === "site_footer")
    ) {
      const entry = getSectionType(root.props.sectionTypeKey);
      const schema = entry?.schemasByVersion[entry.currentVersion];
      const localised = localiseTalentHeaderDefaults(root.props.sectionProps ?? {}, locale);
      const parsed = schema?.safeParse(withHeaderSiteChrome(localised, root.props.sectionTypeKey, args.isDemo === true, args.localeCtx.settings.supportedLocales, args.localeCtx.switcherHrefs));
      if (!entry || !parsed?.success) return null;
      const Comp = entry.Component;
      return (
        <div key={root.id} data-talent-shell-landmark={root.props.sectionTypeKey}>
          <Comp
            sectionId={root.id}
            tenantId={tenantId ?? ""}
            locale={locale}
            preview={false}
            props={parsed.data}
            publicPathPrefix={publicPathPrefix}
          />
          {root.children && root.children.length > 0
            ? renderBuilderNodes(root.children, {
                publicPathPrefix,
                mode: "freeform",
                includeRendererStyles: false,
                includeFontLinks: false,
                captcha: captchaConfig,
                visitorLocale: locale,
                contentLocale: args.localeCtx.contentLocale,
                renderSectionEmbed,
              })
            : null}
        </div>
      );
    }
    return (
      <div key={root.id}>
        {renderBuilderNodes([root], {
          publicPathPrefix,
          mode: "freeform",
          includeRendererStyles: false,
          includeFontLinks: false,
          captcha: captchaConfig,
          visitorLocale: locale,
          contentLocale: args.localeCtx.contentLocale,
          renderSectionEmbed,
        })}
      </div>
    );
  };

  const headerLandmark = headerTree.find(
    (n) => n.kind === "section" && n.props.sectionTypeKey === "site_header",
  );
  const headerHasLandmark = Boolean(headerLandmark);
  const headerScrollCfg =
    headerLandmark && headerLandmark.kind === "section"
      ? (headerLandmark.props.sectionProps as
          | { scrollTone?: string; scrollThresholdPx?: number }
          | undefined)
      : undefined;
  const headerScrollThreshold = headerScrollCfg?.scrollTone
    ? headerScrollCfg.scrollThresholdPx ?? 40
    : null;

  return (
    <div
      data-talent-max-site=""
      data-theme-canvas-root=""
      data-talent-design={args.designSlug ?? undefined}
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
      {/* REND-2: ONE renderer sheet for shell + body, scoped to the kinds in
          BOTH trees; any uncertainty falls back to the full sheet. */}
      <BuilderNodeRendererStyles
        kinds={collectPresentNodeKinds([...shellTree, ...blocks], components)}
        nodes={[...shellTree, ...blocks]}
      />
      <BuilderNodeFontLinks nodes={[...shellTree, ...blocks]} components={components} />
      {hasTokens ? <GoogleFontsLink tokens={effectiveTokens} /> : null}
      <TypeSystemStyle />

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

      {args.isDemo && !(hasShell && headerTree.length > 0 && headerHasLandmark) ? <MaxSiteDemoPill /> : null /* the landmark paints its own pill */}

      {hasShell && headerTree.length > 0 ? (
        headerHasLandmark ? (
          // The landmark's bespoke component renders its own <header.site-header>,
          // so the wrapper is a <div> (no duplicate banner). data-scrolled is
          // toggled by the observer; the token CSS paints the solid bar.
          <div
            data-talent-max-site-header=""
            {...(headerScrollThreshold != null ? { "data-scrolled": "false" } : {})}
          >
            {headerTree.map((root) => renderShellRoot(root))}
            {headerScrollThreshold != null ? (
              <HeaderScrollObserver thresholdPx={headerScrollThreshold} />
            ) : null}
          </div>
        ) : (
          <header data-talent-max-site-header="">
            {renderBuilderNodes(headerTree, {
              publicPathPrefix,
              mode: "freeform",
              includeRendererStyles: false,
              includeFontLinks: false,
              captcha: captchaConfig,
              visitorLocale: locale,
              contentLocale: args.localeCtx.contentLocale,
              renderSectionEmbed,
            })}
          </header>
        )
      ) : null}

      <main id="main-content" data-talent-max-site-main="" style={{ flex: "1 0 auto" }}>
        {renderFreeformPageRootTree(blocks, {
          publicPathPrefix,
          mode: "freeform",
          includeRendererStyles: false,
          includeFontLinks: false,
          styleClasses,
          dataSources: pricedDataSources,
          components,
          componentStyleDefaults: readableButtonDefaults(componentStyleDefaults, effectiveTokens),
          captcha: captchaConfig,
          visitorLocale: locale,
          contentLocale: args.localeCtx.contentLocale,
          ...experimentContext,
          renderSectionEmbed,
        })}
      </main>

      {hasShell && footerTree.length > 0 ? (
        <footer data-talent-max-site-footer="">
          {renderBuilderNodes(footerTree, {
            publicPathPrefix,
            mode: "freeform", dataSources: { socialLinks: footerSocialLinks }, // her own links
            includeRendererStyles: false,
            includeFontLinks: false,
            captcha: captchaConfig,
            visitorLocale: locale,
            contentLocale: args.localeCtx.contentLocale,
            renderSectionEmbed,
          })}
        </footer>
      ) : null}

      {args.isDemo ? <MaxSiteDemoFooter locale={locale} /> : null}

      {/* PHASE 1 — the free site's platform mark. Paid plans remove it. */}
      {showPlatformBadge ? (
        <div
          data-talent-max-site-badge=""
          style={{
            padding: "16px",
            textAlign: "center",
            fontSize: 12,
            color: "var(--token-color-ink-muted, rgba(11,11,13,0.45))",
          }}
        >
          <a href="https://tulala.digital" rel="noopener" style={{ color: "inherit" }}>
            {talentSiteBadgeLabel(locale)}
          </a>
        </div>
      ) : null}
    </div>
  );
}

export type { PublishedTalentPageRenderData };
