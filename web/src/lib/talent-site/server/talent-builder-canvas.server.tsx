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
import { localiseTalentHeaderDefaults } from "@/lib/talent-site/header-cta-locale";
import {
  buildMaxSiteNav,
  coerceTree,
  hydrateShellNav,
} from "@/lib/talent-site/resolve-max-site-core";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";
import {
  DesignSkinStyle,
  designComponentStyleDefaults,
} from "@/lib/talent-site/theme-catalog/collection/design-skin-style";
import { loadMaxSiteIsDemo, withHeaderSiteChrome } from "./render-max-site-demo";
import { splitShell } from "./render-max-site-shell";
import {
  loadMaxSiteByProfileId,
  loadMaxSiteDesignSlug,
  loadMaxSitePages,
  loadMaxSiteThemeTokens,
  loadTalentPlanKey,
  loadTalentSiteCtaMode,
} from "./load-max-site";
import { loadTalentLocaleSwaps } from "./talent-locale-swaps.server";
import { loadPreviewDataSources, resolveMyContentPreviewLocale } from "./preview-my-content.server";
import { prepareTalentSiteTrees, readableButtonDefaults } from "./talent-site-render-fixups.server";

/**
 * Talent page builder canvas: the SAME pipeline the live Max-site render
 * (`renderMaxSiteDocument`) applies, assembled for the in-editor canvas so the
 * builder is WYSIWYG with the published site:
 *
 *  - effective tokens: platform < site (`talent_sites.design_tokens_draft`,
 *    the Design + Look the talent is editing) < page `__design` draft;
 *  - the Design skin (`data-talent-design` + DesignSkinStyle) and its fonts;
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

  const [site, pages, designSlug, siteTokens, platformDefault, siteLocale, planKey, isDemo] =
    await Promise.all([
      loadMaxSiteByProfileId(talentProfileId),
      loadMaxSitePages(talentProfileId),
      loadMaxSiteDesignSlug(talentProfileId),
      loadMaxSiteThemeTokens(talentProfileId, { draft: true }),
      loadPlatformDefaultTheme("talent"),
      resolveMyContentPreviewLocale(talentProfileId, null),
      loadTalentPlanKey(talentProfileId),
      loadMaxSiteIsDemo(talentProfileId),
    ]);
  const [ctaMode, swaps] = await Promise.all([
    loadTalentSiteCtaMode(talentProfileId, planKey),
    loadTalentLocaleSwaps(talentProfileId, siteLocale),
  ]);

  // Page layer: with the site theme on, the Theme drawer edits the SITE
  // draft and keeps the page draft layer as the per-page override, so the
  // canvas shows drafts. Flags off: the page's live tokens, as before.
  const slice = readTalentDesignSlice(input.pageTheme);
  const pageTokens = galleryOn ? slice.tokensDraft : slice.tokens;
  const effectiveTokens = resolveEffectiveSiteTokens(
    pageTokens,
    siteTokens,
    platformDefault.tokens,
  );

  const ownStyles: ComponentStyleDefaults =
    Object.keys(slice.componentStylesDraft).length > 0
      ? slice.componentStylesDraft
      : slice.componentStyles;
  const componentStyleDefaults = readableButtonDefaults(
    Object.keys(ownStyles).length > 0
      ? ownStyles
      : designComponentStyleDefaults(designSlug, platformDefault.componentStyles),
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
  });
  const nav = buildMaxSiteNav(pages.map((p) => ({ ...p, status: "published" })));
  const shell = site?.siteSlug
    ? hydrateShellNav(fixed.shellTree, nav, site.siteSlug, "", "host-root")
    : fixed.shellTree;
  const [headerTree, footerTree] = splitShell(shell);

  const dataSources = await loadPreviewDataSources(talentProfileId, input.tree, siteLocale);

  const renderShell = (roots: BuilderNode[]): ReactNode =>
    roots.length === 0 ? null : (
      <>
        {roots.map((root) => renderShellRoot(root, siteLocale, isDemo))}
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
        <DesignSkinStyle slug={designSlug} />
      </>
    ),
    shellHeader: renderShell(headerTree),
    shellFooter: renderShell(footerTree),
    labelLocale: { locale: siteLocale, ctaMode, swaps },
  };
}

/** One shell root, as `renderMaxSiteDocument` renders it (read-only). */
function renderShellRoot(root: BuilderNode, locale: string, isDemo: boolean): ReactNode {
  const opts = {
    publicPathPrefix: "",
    mode: "freeform" as const,
    includeRendererStyles: false,
    includeFontLinks: false,
    visitorLocale: locale,
  };
  if (
    root.kind === "section" &&
    (root.props.sectionTypeKey === "site_header" || root.props.sectionTypeKey === "site_footer")
  ) {
    const entry = getSectionType(root.props.sectionTypeKey);
    const schema = entry?.schemasByVersion[entry.currentVersion];
    const localised = localiseTalentHeaderDefaults(root.props.sectionProps ?? {}, locale);
    const parsed = schema?.safeParse(
      withHeaderSiteChrome(localised, root.props.sectionTypeKey, isDemo),
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
