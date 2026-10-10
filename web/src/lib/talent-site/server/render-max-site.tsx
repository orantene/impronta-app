import "server-only";
import type { ReactNode } from "react";
import { loadHistoryPreviewSnapshot } from "../history/history.server";
import { loadThemeUpdatePreviewSnapshot } from "../theme-releases/talent-update/talent-update.server";
import { early } from "@/lib/server/early";
import { failOnReadTimeout } from "@/lib/supabase/bounded-fetch-scope";
import { loadMaxSiteIsDemo, MaxSiteDemoFooter, MaxSiteDemoPill, withHeaderSiteChrome } from "./render-max-site-demo";
import { splitShell } from "./render-max-site-shell";
import { builderTreeHasFaqBind, builderTreeHasKind } from "./builder-tree-has-kind";
import { pruneEmptyBoundSections } from "@/lib/talent-site/my-content-prune";
import { pruneDeadSectionLinks } from "@/lib/talent-site/dead-section-links"; import { headerOverlayAllowed } from "@/lib/talent-site/header-overlay";
import { talentSiteLocalePath } from "@/lib/talent-site/talent-site-locale-routing";
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
import { draftPreviewBannerText } from "@/lib/talent-site/draft-preview-copy";
import { headerSectionProps, localiseTalentHeaderDefaults, stripHiddenAskHeaderCta } from "@/lib/talent-site/header-cta-locale";
import { loadTalentAskVisible } from "./talent-ask-visible";
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
import { isGuestCaptchaEnforced, splitGuestCaptchaConfigs } from "@/lib/platform/guest-captcha-enforcement";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { isPlatformCheckoutReady } from "@/lib/talent/online-collect-ready";
import { designTokensToCssVars, designTokensToDataAttrs } from "@/lib/site-admin/tokens/resolve";
import { TalentSiteHtmlTokens } from "@/components/talent/site/TalentSiteHtmlTokens";
import { GoogleFontsLink } from "@/app/google-fonts-link";
import { TypeSystemStyle, typeSystemSheetsForTokens } from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";
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
import { talentSiteShowsPlatformBadge } from "@/lib/talent-site/free-site-badge";
import { TalentSiteSocket } from "@/components/talent-site/talent-site-socket";
import { loadTenantWhitelabel } from "@/lib/brand/tenant-whitelabel";
import {
  buildSocketModel,
  headerShowsLanguageSwitch,
  siteHostFromOrigin,
  socketConsentToolingEnabled,
  stripDesignCredits,
} from "@/lib/talent-site/footer-socket";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";
import { pruneUnconfirmedGuestStubs } from "@/lib/talent-site/prune-unconfirmed-guest-stubs";
import { publicPageBody } from "@/lib/talent-site/talent-page-publish-core";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_TALENT_LIVE_STATUS, loadTalentLiveStatus } from "@/lib/talent/live-status";
import { LIVE_STATUS_CSS, liveStatusRootAttrs, toLiveStatusRenderContext } from "@/lib/talent/live-status-render";
import { LiveStatusExpiry } from "@/components/talent-site/LiveStatusExpiry";
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
import { buildMaxSiteSeo, type MaxSiteSeo } from "./max-site-seo.server";
import { loadMaxSiteSeoFacts } from "./max-site-seo-facts.server";
import { loadTalentSiteLocaleContext, type TalentSiteLocaleContext } from "./talent-site-locale.server";
import { loadUsdRatesForSitePrices } from "./vanity-usd-rates"; import { loadTalentSocialLinks } from "./talent-social-links"; import { webOfficeCtxFor, webOfficeFooter, webOfficeHeaderSocial, type WebOfficeCtx } from "./web-office-footer"; import { webOfficeSocialEnabled } from "../web-office-social";
import { loadTalentPolicyModel, policyMainNode, policySeo } from "./policy-main";
import { policyDocForSlug } from "@/lib/talent-policies/public";

/** Re-export so existing `import type { MaxSiteSeo } from "./render-max-site"` stays valid. */
export type { MaxSiteSeo };

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
  /** With `previewDraft`: render one history entry's snapshot, read-only (`&history=<id>`). */
  previewHistoryEntryId?: string | null;
  /** Phase 4: owner preview of a theme update merged in memory (`?themeUpdate=<id>`). */
  previewThemeUpdateId?: string | null;
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

export type RenderTalentMaxSiteResult =
  | { kind: "render"; node: ReactNode; seo: MaxSiteSeo; /** The locale the body rendered in (bounded to the talent languages). */ locale: string }
  | { kind: "not_found" };

const NOT_FOUND: RenderTalentMaxSiteResult = { kind: "not_found" };

/**
 * Resolve the site row from either key. By-slug is the primary path; by-profile
 * is the custom-domain path. Returns null when neither key resolves a row.
 */
const resolveSiteRow = async (input: RenderTalentMaxSiteInput): Promise<MaxSiteRow | null> =>
  input.siteSlug ? loadMaxSiteBySlug(input.siteSlug) : input.talentProfileId ? loadMaxSiteByProfileId(input.talentProfileId) : null;

/** TUL-444: a read that timed out must surface as an error (500, never cached), not a 404 or a half-rendered site. */
export const renderTalentMaxSite = (input: RenderTalentMaxSiteInput): Promise<RenderTalentMaxSiteResult> =>
  failOnReadTimeout(() => renderTalentMaxSiteUnguarded(input));

async function renderTalentMaxSiteUnguarded(
  input: RenderTalentMaxSiteInput,
): Promise<RenderTalentMaxSiteResult> {
  try {
    const site = await resolveSiteRow(input);
    if (!site || !site.siteSlug) return NOT_FOUND;

    const talentProfileId = site.talentProfileId;
    const previewDraft = input.previewDraft === true;
    // The talent's own languages: bounds the locale, feeds the header switch, the `node.i18n` overlays and hreflang (PR 4 + 5).
    const pLocale = early(loadTalentSiteLocaleContext({ talentProfileId, requestedLocale: input.locale, hrefMode: input.hrefMode, pagePath: input.canonicalPath })); // TUL-444: independent reads start together
    const pPlan = early(loadTalentPlanKey(talentProfileId)), pPages = early(loadMaxSitePages(talentProfileId)), pDesign = early(loadMaxSiteDesignSlug(talentProfileId));
    const pTenant = early(loadTalentManagingTenantId(talentProfileId)), pIdentity = early(loadTalentSiteIdentity(talentProfileId)), pDemo = early(loadMaxSiteIsDemo(talentProfileId)); const pCta = early(pPlan.then((plan) => loadTalentSiteCtaMode(talentProfileId, plan)));
    const localeCtx = await pLocale, locale = localeCtx.locale, pSeoFacts = early(loadMaxSiteSeoFacts(talentProfileId, locale));
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
      // A non-owner who appends ?preview=draft falls through to the PUBLIC gate (published site, or 404), never the draft.
    }

    // ── Plan + publish gate ─────────────────────────────────────────────────
    // The public path requires `personalSitePublish` + a published site. The
    // owner draft preview bypasses the gate so the owner can preview an
    // unpublished draft — but the plan is still READ there, because read-time
    // SEO scoping below needs it on both paths.
    const planKey = await pPlan, ctaMode = await pCta; // seeded CTA copy follows booking mode
    const gateOpen = maxSitePublicGate({
      sitePublishedAt: site.sitePublishedAt,
      planKey,
      isOwnerDraftPreview,
    });
    if (!gateOpen) return NOT_FOUND;

    // Theme releases Phase 2 — the owner's read-only preview of a saved version.
    const snap = isOwnerDraftPreview && input.previewHistoryEntryId
      ? await loadHistoryPreviewSnapshot(talentProfileId, input.previewHistoryEntryId)
      : isOwnerDraftPreview && input.previewThemeUpdateId
        ? await loadThemeUpdatePreviewSnapshot(talentProfileId, input.previewThemeUpdateId)
        : null;

    // ── Pick the shell + page set for this view ─────────────────────────────
    const shellSource = snap?.shell ?? (isOwnerDraftPreview ? site.shellTree : site.shellPublished);
    const shellTree = coerceTree(shellSource);

    const allPages = await pPages;
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
    // `/politicas` and `/privacidad` are platform pages: the site's shell and theme (from home), only the body swaps.
    const policyDoc = policyDocForSlug(input.pageSlug);
    const page = selectMaxSitePage(pages, {
      pageSlug: policyDoc ? null : input.pageSlug,
      requirePublished,
    });
    if (!page) return NOT_FOUND;

    // Guest body + early design slug (live media / Maison trade-app fixups).
    const designSlugEarly = await pDesign;
    const snapBlocks = snap?.pages?.[page.id];
    const body = coerceTree(snapBlocks ?? publicPageBody(page, { draftPreview: isOwnerDraftPreview }));
    const fixed = await prepareTalentSiteTrees({ talentProfileId, locale, chain: localeCtx.chain, logoUrl: site.logoUrl, shellTree, body, ctaMode, designSlug: designSlugEarly, siteSlug: site.siteSlug });
    const blocks = pruneUnconfirmedGuestStubs(fixed.body);
    if (!policyDoc && !hasRenderableBuilderNodes(blocks, { mode: "freeform" })) {
      // A published-but-empty page → 404 rather than a blank document.
      return NOT_FOUND;
    }

    // ── Build nav from the published pages (owner preview also shows drafts) ──
    const navSource: readonly MaxSitePageRow[] = requirePublished
      ? pages
      : pages.map((p) => ({ ...p, status: "published" }));
    const nav = buildMaxSiteNav(navSource, locale, localeCtx.chain);
    const publicPathPrefix = input.publicPathPrefix ?? "";
    const hydratedShell = hydrateShellNav(
      fixed.shellTree,
      nav,
      site.siteSlug,
      publicPathPrefix,
      input.hrefMode ?? "path",
    );

    // ── Managing tenant — section-embed render context for the page body ─────
    const tenantId = await pTenant;

    // ── Talent identity for the SITE's JSON-LD + OG image (degrade-safe) ──────
    const identity = await pIdentity;

    // Demo pill + theme tokens (Design slug already loaded above).
    const isDemo = await pDemo;
    const siteTokens = snap?.tokens ?? (await loadMaxSiteThemeTokens(talentProfileId, { draft: isOwnerDraftPreview }));
    const designSlug = designSlugEarly;
    const policyModel = policyDoc ? await loadTalentPolicyModel(talentProfileId, policyDoc, locale) : null;
    const node = await renderMaxSiteDocument({
      mainOverride: policyModel ? policyMainNode(policyModel) : undefined,
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
      // PHASE 1 — a free site carries the "Made with Tulala" mark; a paid plan removes it (same predicate as /t/[code]).
      showPlatformBadge: talentSiteShowsPlatformBadge(planKey),
      isDemo,
      talentName: identity?.name ?? null,
      profileCode: identity?.profileCode ?? null,
      siteHost: siteHostFromOrigin(input.canonicalOrigin ?? process.env.NEXT_PUBLIC_SITE_URL),
      webOffice: webOfficeCtxFor(webOfficeSocialEnabled(planKey), { canonicalOrigin: input.canonicalOrigin ?? process.env.NEXT_PUBLIC_SITE_URL, canonicalPath: input.canonicalPath, siteSlug: site.siteSlug }),
    });

    const seoFacts = await pSeoFacts; // services, links, city; never throws

    const seo = buildMaxSiteSeo({
      ...seoFacts,
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
      ignoreExplicitCanonical: Boolean(policyDoc),
      locales: { primary: localeCtx.settings.defaultLocale, urlDefault: localeCtx.grammar.defaultLocale, supported: localeCtx.settings.supportedLocales },
    });

    return { kind: "render", node, seo: policyModel ? policySeo(seo, policyModel) : seo, locale };
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
  /** Replaces the page body (policy pages); the shell still wraps it. */
  mainOverride?: ReactNode;
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
  /** The talent's display name: labels the first group of the Tulala strip. */
  talentName?: string | null;
  /** TUL-310 footer Help context. */
  profileCode?: string | null;
  siteHost?: string | null;
  /** Paid Web Office only: footer links + source WhatsApp text. */ webOffice?: WebOfficeCtx | null;
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

  // Captcha for form + services_catalog (missing widget → silent reject; 2026-08-16).
  const pageNeedsCaptcha = (function needsCaptcha(nodes: unknown): boolean {
    if (Array.isArray(nodes)) return nodes.some(needsCaptcha);
    if (!nodes || typeof nodes !== "object") return false;
    const n = nodes as { kind?: unknown; children?: unknown };
    return n.kind === "form" || n.kind === "services_catalog" || needsCaptcha(n.children);
  })([shellTree, blocks]);

  // PAGE body data sources (tenant-scoped). Shell is talent header/footer — no
  // tenant bindings. Unrostered Max (`tenantId === null`) still loads catalog
  // sources by talent profile when the tree needs offerings.
  const pageNeedsServicesCatalog =
    builderTreeHasKind(blocks, "services_catalog") || builderTreeHasKind(blocks, "task_picker");
  const pageNeedsPortfolio = builderTreeHasKind(blocks, "portfolio");
  const pageNeedsReviews = builderTreeHasKind(blocks, "reviews");
  const pageNeedsVisit = builderTreeHasKind(blocks, "visit");
  const pageNeedsCompCard = builderTreeHasKind(blocks, "comp_card");
  const pageNeedsFaq = builderTreeHasFaqBind(blocks);
  const pageNeedsNextFreeChip = builderTreeHasKind(blocks, "next_free_chip");
  const pageNeedsTalentOfferings =
    pageNeedsServicesCatalog || pageNeedsPortfolio || pageNeedsNextFreeChip;

  // Codex P2: catalogBookingLive=false mounts demo booking on published free vanity; own-work Path A uses the platform hub (like Agenda).
  let bookingTenantId: string | null = tenantId;
  if (!bookingTenantId && !draftPreview && pageNeedsTalentOfferings) {
    bookingTenantId = (await getPlatformHubTenant())?.tenantId ?? null;
  }
  const catalogBookingLive = Boolean(bookingTenantId) && !draftPreview;
  // Published vanity with a booking tenant always resolves captcha for catalog.
  const resolveCaptcha = Boolean(bookingTenantId) && (pageNeedsCaptcha || !draftPreview);

  const [dataSources, components, platformDefault, experimentContext, pageCaptcha, captchaEnforced, talentOfferings, liveStatusRow, askVisible] =
    await Promise.all([
      tenantId
        ? loadBuilderNodeDataSources(blocks, tenantId, locale, null, talentProfileId, args.localeCtx.settings.defaultLocale)
        : pageNeedsTalentOfferings || pageNeedsReviews || pageNeedsVisit || pageNeedsCompCard || pageNeedsFaq
          ? loadPersonalMaxNativeSources({
              talentProfileId,
              locale,
              primaryLocale: args.localeCtx.settings.defaultLocale,
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
      // ABTEST-1 — stable per-visitor seed for any A/B CTA/form nodes on the talent's personal Max site.
      resolveExperimentRenderContext({ tenantId, surface: "talentSite" }),
      resolveCaptcha && bookingTenantId
        ? resolveTenantCaptcha(bookingTenantId)
        : Promise.resolve(null),
      isGuestCaptchaEnforced(),
      // D-MSG-421 — vanity hosts never went through profile-storefront-payload,
      // so peso prices printed with no ≈ US$ line. Tenant stays null: this is
      // the talent's own site, not an agency storefront.
      loadPublicOfferingsForProfile(talentProfileId, locale, null),
      // G3b: "Atiendo emergencias hoy", read PER REQUEST (this route is
      // force-dynamic). Service role: the table has no anon read by design.
      (async () => {
        const admin = createServiceRoleClient();
        return admin ? loadTalentLiveStatus(admin, talentProfileId) : { ...DEFAULT_TALENT_LIVE_STATUS };
      })(),
      loadTalentAskVisible(talentProfileId),
    ]);
  // Expiry is applied here, at render time: a lapsed flag renders as off.
  const liveStatus = toLiveStatusRenderContext(liveStatusRow, new Date());
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
    liveStatus,
  };

  // Forms keep tenant captcha; booking alone follows HQ guest_captcha_enforced.
  const { formCaptchaConfig, bookingCaptchaConfig } = splitGuestCaptchaConfigs(
    pageCaptcha,
    captchaEnforced,
  );

  const renderSectionEmbed = tenantId
    ? makeSectionEmbedRenderer({
        tenantId,
        locale,
        publicPathPrefix,
        previewSubject: { kind: "talent", id: talentProfileId, locale },
        captcha: formCaptchaConfig,
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
  const [headerTree, rawFooterTree] = splitShell(shellTree, { webOfficeSocial: Boolean(args.webOffice) });
  // The socket carries the ONE Tulala credit: hide any design-level credit at render time.
  const footerTree = stripDesignCredits(rawFooterTree);
  // Footer links to Location / Visit are decided against the sections this page really renders
  // (an override page, such as a policy page, renders neither, so those links drop).
  const renderedBlocks = pruneEmptyBoundSections(blocks, pricedDataSources);
  // Off the home page (policy pages) the anchors point back at the home page: `/#services`, `/en#services`.
  const homePath = args.mainOverride ? talentSiteLocalePath("/", locale, args.localeCtx.settings.defaultLocale, args.localeCtx.settings.supportedLocales) : undefined;
  const liveFooterTree = pruneDeadSectionLinks(footerTree, renderedBlocks, [headerTree], { homePath });
  // The header's section links get the same treatment (a talent with no reviews has no #reviews band, so the link goes).
  const liveHeaderTree = pruneDeadSectionLinks(headerTree, renderedBlocks, [footerTree], { homePath });
  // TUL-133: a transparent header gets white text only over a dark full-bleed hero.
  const overHeroAttr = headerOverlayAllowed(renderedBlocks) ? { "data-over-hero": "true" } : {};
  const hasSocialNode = builderTreeHasKind(footerTree, "social_links"); const { records: footerSocialLinks, strip: webOfficeStrip } = webOfficeFooter(args.webOffice, hasSocialNode || args.webOffice ? await loadTalentSocialLinks(talentProfileId) : [], hasSocialNode, locale);
  const socketModel = buildSocketModel({
    locale,
    publicPathPrefix,
    supportedLocales: args.localeCtx.settings.supportedLocales,
    primaryLocale: args.localeCtx.settings.defaultLocale,
    switcherHrefs: args.localeCtx.switcherHrefs,
    showCredit: showPlatformBadge,
    whitelabel: tenantId ? await loadTenantWhitelabel(tenantId) : false,
    consentTooling: socketConsentToolingEnabled(),
    talentName: args.talentName,
    headerHasLanguageSwitch: headerShowsLanguageSwitch(headerTree),
    helpContext: args.profileCode ? { profileCode: args.profileCode, siteHost: args.siteHost ?? null } : null,
  });

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
      const localised = stripHiddenAskHeaderCta(
        localiseTalentHeaderDefaults(headerSectionProps(root, locale), locale),
        askVisible,
      );
      const parsed = schema?.safeParse(withHeaderSiteChrome(localised, root.props.sectionTypeKey, args.isDemo === true, args.localeCtx.settings.supportedLocales, args.localeCtx.switcherHrefs, webOfficeHeaderSocial(args.webOffice, footerSocialLinks, locale)));
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
                dataSources: { liveStatus },
                captcha: formCaptchaConfig,
                bookingCaptcha: bookingCaptchaConfig,
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
          dataSources: { liveStatus },
          captcha: formCaptchaConfig,
          bookingCaptcha: bookingCaptchaConfig,
          visitorLocale: locale,
          contentLocale: args.localeCtx.contentLocale,
          renderSectionEmbed,
        })}
      </div>
    );
  };

  const headerLandmark = liveHeaderTree.find(
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
      {...liveStatusRootAttrs(liveStatus)}
      style={{
        ...(cssVars as React.CSSProperties),
        backgroundColor: "var(--token-color-background, #ffffff)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Client-account P0 — the same tokens on <html>, so sibling platform UI
          (dock, socket) can inherit them. Additive; the vars above stay. */}
      {hasTokens ? <TalentSiteHtmlTokens cssVars={cssVars} dataAttrs={dataAttrs} /> : null}
      {/* A11Y-2 — first focusable element on every talent Max site surface. */}
      <SkipToContent locale={locale} />
      {/* G3b: hide the variant the root's live status does not match; the
          island flips the root to "off" at local midnight in an open tab. */}
      <style data-live-status-css="">{LIVE_STATUS_CSS}</style>
      {liveStatus.emergenciesToday ? <LiveStatusExpiry until={liveStatus.emergenciesUntil} /> : null}
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
      <TypeSystemStyle systems={typeSystemSheetsForTokens(effectiveTokens)} />

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
          {draftPreviewBannerText(locale)}
        </div>
      ) : null}

      {args.isDemo && !(hasShell && headerTree.length > 0 && headerHasLandmark) ? <MaxSiteDemoPill /> : null /* the landmark paints its own pill */}

      {hasShell && headerTree.length > 0 ? (
        headerHasLandmark ? (
          // The landmark's bespoke component renders its own <header.site-header>,
          // so the wrapper is a <div> (no duplicate banner). data-scrolled is
          // toggled by the observer; the token CSS paints the solid bar.
          <div
            data-talent-max-site-header="" {...overHeroAttr}
            {...(headerScrollThreshold != null ? { "data-scrolled": "false" } : {})}
          >
            {liveHeaderTree.map((root) => renderShellRoot(root))}
            {headerScrollThreshold != null ? (
              <HeaderScrollObserver thresholdPx={headerScrollThreshold} />
            ) : null}
          </div>
        ) : (
          <header data-talent-max-site-header="" {...overHeroAttr}>
            {renderBuilderNodes(liveHeaderTree, {
              publicPathPrefix,
              mode: "freeform",
              includeRendererStyles: false,
              includeFontLinks: false,
              dataSources: { liveStatus },
              captcha: formCaptchaConfig,
              bookingCaptcha: bookingCaptchaConfig,
              visitorLocale: locale,
              contentLocale: args.localeCtx.contentLocale,
              renderSectionEmbed,
            })}
          </header>
        )
      ) : null}

      <main id="main-content" data-talent-max-site-main="" style={{ flex: "1 0 auto" }}>
        {args.mainOverride ?? renderFreeformPageRootTree(renderedBlocks, {
          publicPathPrefix,
          mode: "freeform",
          includeRendererStyles: false,
          includeFontLinks: false,
          styleClasses,
          dataSources: pricedDataSources,
          components,
          componentStyleDefaults: readableButtonDefaults(componentStyleDefaults, effectiveTokens),
          captcha: formCaptchaConfig,
          bookingCaptcha: bookingCaptchaConfig,
          visitorLocale: locale,
          contentLocale: args.localeCtx.contentLocale,
          ...experimentContext,
          renderSectionEmbed,
        })}
      </main>

      {hasShell && footerTree.length > 0 ? (
        <footer data-talent-max-site-footer="">
          {renderBuilderNodes(liveFooterTree, {
            publicPathPrefix,
            mode: "freeform", dataSources: { socialLinks: footerSocialLinks, liveStatus }, // her own links
            includeRendererStyles: false,
            includeFontLinks: false,
            captcha: formCaptchaConfig,
            bookingCaptcha: bookingCaptchaConfig,
            visitorLocale: locale,
            contentLocale: args.localeCtx.contentLocale,
            renderSectionEmbed,
          })}{webOfficeStrip}
        </footer>
      ) : null}

      {args.isDemo ? <MaxSiteDemoFooter locale={locale} /> : null}

      {/* Global Tulala footer socket: one shared bottom strip under every
          design's own footer (replaces the scattered "Made with Tulala"). */}
      <TalentSiteSocket model={socketModel} />
    </div>
  );
}

export type { PublishedTalentPageRenderData };
