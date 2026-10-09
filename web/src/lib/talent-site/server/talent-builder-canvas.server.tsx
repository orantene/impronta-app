import "server-only";

import type { ReactNode } from "react";

import { GoogleFontsLink } from "@/app/google-fonts-link";
import {
  renderBuilderNodes,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import {
  collectBuilderSectionEmbedNodes,
  makeSectionEmbedRenderer,
} from "@/lib/site-admin/builder-node/section-embed-renderer";
import { readTalentDesignSlice } from "@/lib/site-admin/edit-mode/talent-design-store";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { headerSectionProps, localiseTalentHeaderDefaults } from "@/lib/talent-site/header-cta-locale";
import {
  buildMaxSiteNav,
  coerceTree,
  hydrateShellNav,
} from "@/lib/talent-site/resolve-max-site-core";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";
import { TypeSystemStyle } from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";
import { BreakpointStyleEngine } from "@/components/edit-chrome/breakpoint-style-engine";
import { BUILTIN_EXTRA_TIERS } from "@/lib/site-admin/builder-node/custom-breakpoint-css";
import { designTokenDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";
import { typeSystemComponentStyleDefaults } from "@/lib/talent-site/theme-catalog/collection/design-type-system";
import { loadMaxSiteIsDemo, withHeaderSiteChrome } from "./render-max-site-demo";
import { splitShell } from "./render-max-site-shell";
import {
  loadMaxSiteByProfileId,
  loadMaxSiteDesignSlug,
  loadMaxSitePages,
  loadMaxSiteThemeTokens,
  loadTalentSiteIdentity,
  loadTalentPlanKey,
  loadTalentSiteCtaMode,
} from "./load-max-site";
import { TalentSiteSocket } from "@/components/talent-site/talent-site-socket";
import { loadTenantWhitelabel } from "@/lib/brand/tenant-whitelabel";
import {
  buildSocketModel,
  headerShowsLanguageSwitch,
  socketConsentToolingEnabled,
  socketLockedHint,
  stripDesignCredits,
} from "@/lib/talent-site/footer-socket";
import { talentSiteShowsPlatformBadge } from "@/lib/talent-site/free-site-badge";
import { treeHasLiveCandidates } from "../live-text";
import { headerOverlayAllowed } from "../header-overlay";
import { loadTalentLiveText } from "./load-live-text.server";
import { loadTalentLocaleSwaps } from "./talent-locale-swaps.server";
import { loadPreviewDataSources } from "./preview-my-content.server";
import { loadTalentSiteLocaleContext, type TalentSiteLocaleContext } from "./talent-site-locale.server";
import { prepareTalentSiteTrees, readableButtonDefaults } from "./talent-site-render-fixups.server";

/**
 * Talent page builder canvas: the SAME pipeline the live Max-site render
 * (`renderMaxSiteDocument`) applies, assembled for the in-editor canvas so the
 * builder is WYSIWYG with the published site:
 *
 *  - effective tokens: platform < site (`talent_sites.design_tokens_draft`,
 *    the Design + Look the talent is editing) < page `__design` draft;
 *  - the Design type system (`TypeSystemStyle` + token defaults) and its fonts;
 *  - the Design's component-style defaults (accent pill buttons) unless the
 *    talent saved her own;
 *  - seeded labels in the SITE locale and booking mode (applied client-side
 *    to the live tree, so edits still repaint and nothing is written);
 *  - the site header and footer (draft shell), read-only around the page.
 *
 * Works without a managing agency (free / solo talents): data sources come
 * from the personal loaders, exactly as on the live host. Read-only.
 */
export async function buildTalentBuilderCanvasData(input: {
  talentProfileId: string;
  pageSlug: string;
  /** The page draft tree (`talent_pages.blocks`). */
  tree: BuilderNode[];
  /** The page `talent_pages.theme` value (style classes + `__design`). */
  pageTheme: unknown;
  /** Managing agency (rostered talents): pre-renders any `section_embed`. */
  tenantId?: string | null;
}): Promise<InEditorCanvasRenderData> {
  const { talentProfileId } = input;
  const galleryOn = isTalentThemeGalleryEnabled();

  const [site, pages, designSlug, siteTokens, platformDefault, localeCtx, planKey, isDemo] =
    await Promise.all([
      loadMaxSiteByProfileId(talentProfileId),
      loadMaxSitePages(talentProfileId),
      loadMaxSiteDesignSlug(talentProfileId),
      loadMaxSiteThemeTokens(talentProfileId, { draft: true }),
      loadPlatformDefaultTheme("talent"),
      // The talent's languages; the canvas previews the primary, and a
      // translated node reads through its `node.i18n` overlay (dimmed when it
      // falls back, editor only).
      loadTalentSiteLocaleContext({ talentProfileId, requestedLocale: null, hrefMode: "host-root", editorPreview: true }),
      loadTalentPlanKey(talentProfileId),
      loadMaxSiteIsDemo(talentProfileId),
    ]);
  const siteLocale = localeCtx.locale;
  // F93 - the preview data sources depend only on the locale, so they load
  // alongside the CTA/swaps batch and the shell prep instead of after them.
  const dataSourcesP = loadPreviewDataSources(talentProfileId, input.tree, siteLocale);
  dataSourcesP.catch(() => undefined);
  // Lines that follow her profile load alongside the batch below (only when the page has any).
  const liveP = treeHasLiveCandidates(input.tree) ? loadTalentLiveText(talentProfileId, siteLocale, localeCtx.chain) : Promise.resolve(null);
  const [ctaMode, swaps] = await Promise.all([
    loadTalentSiteCtaMode(talentProfileId, planKey),
    loadTalentLocaleSwaps(talentProfileId, siteLocale, localeCtx.chain),
  ]);
  const live = await liveP;

  // Page layer: with the site theme on, the Theme drawer edits the SITE
  // draft and keeps the page draft layer as the per-page override, so the
  // canvas shows drafts. Flags off: the page's live tokens, as before.
  const slice = readTalentDesignSlice(input.pageTheme);
  const pageTokens = galleryOn ? slice.tokensDraft : slice.tokens;
  const effectiveTokens = resolveEffectiveSiteTokens(
    pageTokens,
    siteTokens,
    platformDefault.tokens,
    designTokenDefaults(designSlug),
  );

  const ownStyles: ComponentStyleDefaults =
    Object.keys(slice.componentStylesDraft).length > 0
      ? slice.componentStylesDraft
      : slice.componentStyles;
  const componentStyleDefaults = readableButtonDefaults(
    Object.keys(ownStyles).length > 0
      ? ownStyles
      : typeSystemComponentStyleDefaults(effectiveTokens, platformDefault.componentStyles),
    effectiveTokens,
  );

  // Header + footer: the DRAFT shell, localised and with the site nav, the
  // same way the owner's draft preview renders it.
  const fixed = await prepareTalentSiteTrees({
    talentProfileId,
    locale: siteLocale,
    logoUrl: site?.logoUrl ?? null,
    shellTree: coerceTree(site?.shellTree),
    body: [],
    ctaMode,
    chain: localeCtx.chain,
  });
  const nav = buildMaxSiteNav(pages.map((p) => ({ ...p, status: "published" })));
  const shell = site?.siteSlug
    ? hydrateShellNav(fixed.shellTree, nav, site.siteSlug, "", "host-root")
    : fixed.shellTree;
  const [headerTree, rawFooterTree] = splitShell(shell);
  // The socket carries the ONE Tulala credit, so the canvas hides any design-level one too.
  const footerTree = stripDesignCredits(rawFooterTree);
  const socketModel = buildSocketModel({
    locale: siteLocale,
    publicPathPrefix: "",
    supportedLocales: localeCtx.settings.supportedLocales,
    primaryLocale: localeCtx.settings.defaultLocale,
    switcherHrefs: localeCtx.switcherHrefs,
    showCredit: talentSiteShowsPlatformBadge(planKey),
    whitelabel: input.tenantId ? await loadTenantWhitelabel(input.tenantId) : false,
    consentTooling: socketConsentToolingEnabled(),
    talentName: (await loadTalentSiteIdentity(talentProfileId))?.name ?? null,
    headerHasLanguageSwitch: headerShowsLanguageSwitch(headerTree),
  });

  const dataSources = await dataSourcesP;

  const renderShell = (roots: BuilderNode[]): ReactNode =>
    roots.length === 0 ? null : (
      <>
        {roots.map((root) => renderShellRoot(root, localeCtx, isDemo))}
      </>
    );

  const sectionEmbedIslands: Record<string, ReactNode> = {};
  if (input.tenantId) {
    const renderEmbed = makeSectionEmbedRenderer({
      tenantId: input.tenantId,
      locale: siteLocale,
      publicPathPrefix: "",
      previewSubject: { kind: "talent", id: talentProfileId, locale: siteLocale },
      editorMode: true,
    });
    for (const embed of collectBuilderSectionEmbedNodes(input.tree)) {
      sectionEmbedIslands[embed.id] = renderEmbed(embed);
    }
  }

  return {
    dataSources,
    sectionEmbedIslands,
    componentStyleDefaults,
    publicPathPrefix: "",
    designTokens: effectiveTokens,
    designSlug,
    headNodes: (
      <>
        <GoogleFontsLink tokens={effectiveTokens} />
        <TypeSystemStyle />
        <BreakpointStyleEngine tiers={BUILTIN_EXTRA_TIERS} includeFreeform />
      </>
    ),
    shellHeader: renderShell(headerTree),
    shellHeaderOverHero: headerOverlayAllowed(input.tree),
    shellFooter: renderShell(footerTree),
    shellSocket: <TalentSiteSocket model={socketModel} hint={socketLockedHint(siteLocale)} clearDock={false} />,
    labelLocale: { locale: siteLocale, ctaMode, swaps, ...(live ? { live } : {}) },
  };
}

/** One shell root, as `renderMaxSiteDocument` renders it (read-only). */
export function renderShellRoot(root: BuilderNode, localeCtx: TalentSiteLocaleContext, isDemo: boolean): ReactNode {
  const locale = localeCtx.locale;
  const opts = {
    publicPathPrefix: "",
    mode: "freeform" as const,
    includeRendererStyles: false,
    includeFontLinks: false,
    visitorLocale: locale,
    contentLocale: localeCtx.contentLocale,
  };
  if (
    root.kind === "section" &&
    (root.props.sectionTypeKey === "site_header" || root.props.sectionTypeKey === "site_footer")
  ) {
    const entry = getSectionType(root.props.sectionTypeKey);
    const schema = entry?.schemasByVersion[entry.currentVersion];
    const localised = localiseTalentHeaderDefaults(headerSectionProps(root, locale), locale);
    const parsed = schema?.safeParse(
      withHeaderSiteChrome(localised, root.props.sectionTypeKey, isDemo, localeCtx.settings.supportedLocales, localeCtx.switcherHrefs),
    );
    if (!entry || !parsed?.success) return null;
    const Comp = entry.Component;
    return (
      <div key={root.id} data-talent-shell-landmark={root.props.sectionTypeKey}>
        <Comp
          sectionId={root.id}
          tenantId=""
          locale={locale}
          preview={false}
          props={parsed.data}
          publicPathPrefix=""
        />
        {root.children && root.children.length > 0 ? renderBuilderNodes(root.children, opts) : null}
      </div>
    );
  }
  return <div key={root.id}>{renderBuilderNodes([root], opts)}</div>;
}
