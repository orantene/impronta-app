import "server-only";

import type { ReactNode } from "react";

import { GoogleFontsLink } from "@/app/google-fonts-link";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import type { BuilderNode } from "@/lib/site-admin/builder-node";
import {
  collectBuilderSectionEmbedNodes,
  makeSectionEmbedRenderer,
} from "@/lib/site-admin/builder-node/section-embed-renderer";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { flattenProfileTokens } from "@/lib/talent-site/default-talent-tree";
import { demosFor } from "@/lib/talent-site/demos/registry";
import type { DemoDesign } from "@/lib/talent-site/demos/types";
import { treeHasLiveCandidates } from "@/lib/talent-site/live-text";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";
import { TypeSystemStyle } from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";
import { designTokenDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";
import { typeSystemComponentStyleDefaults } from "@/lib/talent-site/theme-catalog/collection/design-type-system";
import { galleryDefaultLookTokens, galleryPaletteLookTokens } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { talentProfileTokens } from "@/lib/talent-site/token-projection";
import { loadDefaultTalentFreeformContext } from "@/lib/talent-site/server/default-talent-context";
import { loadMaxSiteIsDemo } from "@/lib/talent-site/server/render-max-site-demo";
import { splitShell } from "@/lib/talent-site/server/render-max-site-shell";
import { loadTalentLiveText } from "@/lib/talent-site/server/load-live-text.server";
import { loadTalentLocaleSwaps } from "@/lib/talent-site/server/talent-locale-swaps.server";
import { loadPreviewDataSources } from "@/lib/talent-site/server/preview-my-content.server";
import { loadTalentSiteLocaleContext } from "@/lib/talent-site/server/talent-site-locale.server";
import { readableButtonDefaults } from "@/lib/talent-site/server/talent-site-render-fixups.server";
import { renderShellRoot } from "@/lib/talent-site/server/talent-builder-canvas.server";
import { loadTalentPlanKey, loadTalentSiteCtaMode } from "@/lib/talent-site/server/load-max-site";
import { hydratePlaceholders } from "./hydrate-placeholders";
import { themeTemplatePaletteTokens } from "./theme-template-tokens";
import type { ThemeDraft, ThemeDraftTree } from "./types";

/** The demo talent a design previews with when no `?subject=` is given: its reference demo. */
export function defaultSubjectFor(design: string): string | null {
  const demos = demosFor(design as DemoDesign);
  return (demos.find((d) => d.reference) ?? demos[0])?.profileCode ?? null;
}

async function profileIdForCode(code: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin.from("talent_profiles").select("id").eq("profile_code", code).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Look tokens for `?look=` (a design palette key), else the design's default look. */
export function themeTemplateLookTokens(design: string, look: string | null | undefined): Record<string, string> {
  const fromLook = look ? galleryPaletteLookTokens(design, look) : null;
  return fromLook ?? galleryDefaultLookTokens(design) ?? {};
}

/**
 * Canvas data for the Template Factory editor. The editor document stays
 * un-hydrated; this returns the render data plus `placeholders`, which the
 * canvas uses to fill `{{tokens}}` at render time (see `hydratePlaceholders`).
 * Everything here is read-only against the subject talent (service role).
 *
 * `tree` is the tree being edited: with "home" the draft shell is shown
 * read-only around the page (hydrated here), with "shell" the canvas paints the
 * shell itself.
 */
export async function buildThemeTemplateCanvasData(input: {
  design: string;
  subjectCode: string | null | undefined;
  look: string | null | undefined;
  draft: ThemeDraft;
  tree?: ThemeDraftTree;
  lang?: "en" | "es" | null;
}): Promise<InEditorCanvasRenderData & { subjectCode: string | null; placeholders: Record<string, string> }> {
  const { design, draft } = input;
  const tree = input.tree ?? "home";
  const subjectCode = input.subjectCode?.trim() || defaultSubjectFor(design);
  const profileId = subjectCode ? await profileIdForCode(subjectCode) : null;
  const platformDefault = await loadPlatformDefaultTheme("talent");

  const lookTokens = themeTemplatePaletteTokens(design, input.look ?? draft.preview.look, draft.payload);
  const effectiveTokens = resolveEffectiveSiteTokens(
    {},
    { ...lookTokens, ...(draft.preview.previewTokens ?? {}) },
    platformDefault.tokens,
    { ...designTokenDefaults(design), ...(draft.payload.tokenDefaults ?? {}) },
  );
  const componentStyleDefaults = readableButtonDefaults(
    typeSystemComponentStyleDefaults(effectiveTokens, platformDefault.componentStyles),
    effectiveTokens,
  );
  const head: ReactNode = (
    <>
      <GoogleFontsLink tokens={effectiveTokens} />
      <TypeSystemStyle />
    </>
  );
  const base = {
    sectionEmbedIslands: {} as Record<string, ReactNode>,
    componentStyleDefaults,
    publicPathPrefix: "",
    designTokens: effectiveTokens,
    designSlug: design,
    headNodes: head,
    subjectCode: subjectCode ?? null,
  };

  const ctx = profileId ? await loadDefaultTalentFreeformContext(profileId) : null;
  if (!profileId || !ctx) {
    // Unknown subject: the canvas still paints the design, placeholders read as ghosts.
    return { ...base, dataSources: {}, placeholders: {} };
  }

  const localeCtx = await loadTalentSiteLocaleContext({
    talentProfileId: profileId,
    requestedLocale: input.lang ?? null,
    hrefMode: "host-root",
    editorPreview: true,
  });
  const locale = localeCtx.locale;
  const editedTree = tree === "shell" ? draft.payload.shellTree : draft.payload.homeTree;
  const allTrees = [...draft.payload.homeTree, ...draft.payload.shellTree];

  const placeholders: Record<string, string> = {
    ...flattenProfileTokens(talentProfileTokens(ctx.profile, ctx.media)),
    year: String(new Date().getFullYear()),
  };

  const [planKey, isDemo] = await Promise.all([loadTalentPlanKey(profileId), loadMaxSiteIsDemo(profileId)]);
  const [dataSources, ctaMode, swaps, live] = await Promise.all([
    loadPreviewDataSources(profileId, allTrees, locale),
    loadTalentSiteCtaMode(profileId, planKey),
    loadTalentLocaleSwaps(profileId, locale, localeCtx.chain),
    treeHasLiveCandidates(editedTree)
      ? loadTalentLiveText(profileId, locale, localeCtx.chain)
      : Promise.resolve(null),
  ]);

  const sectionEmbedIslands: Record<string, ReactNode> = {};
  if (ctx.tenantId) {
    const renderEmbed = makeSectionEmbedRenderer({
      tenantId: ctx.tenantId,
      locale,
      publicPathPrefix: "",
      previewSubject: { kind: "talent", id: profileId, locale },
      editorMode: true,
    });
    for (const embed of collectBuilderSectionEmbedNodes(hydratePlaceholders(editedTree, placeholders, locale))) {
      sectionEmbedIslands[embed.id] = renderEmbed(embed);
    }
  }

  let shellHeader: ReactNode = null;
  let shellFooter: ReactNode = null;
  if (tree === "home" && draft.payload.shellTree.length > 0) {
    const [headerTree, footerTree] = splitShell(hydratePlaceholders(draft.payload.shellTree, placeholders, locale));
    const render = (roots: BuilderNode[]): ReactNode =>
      roots.length === 0 ? null : <>{roots.map((r) => renderShellRoot(r, localeCtx, isDemo))}</>;
    shellHeader = render(headerTree);
    shellFooter = render(footerTree);
  }

  return {
    ...base,
    dataSources,
    sectionEmbedIslands,
    placeholders,
    shellHeader,
    shellFooter,
    labelLocale: { locale, ctaMode, swaps, ...(live ? { live } : {}) },
  };
}
