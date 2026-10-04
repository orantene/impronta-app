/**
 * theme_template surface adapter (Template Factory goal #2). TALENT-ONLY: a
 * platform admin edits ONE tree (home or shell) of a talent DESIGN draft
 * (`talent_theme_drafts`) in the real page builder.
 *
 * Structural precedent: print / platform_lab (injected action seam, no
 * `server-only` so tests can spy). Persistence is CAS on the draft `rev`: the
 * editor's `pageVersion` IS the rev, and every save sends the rev it read.
 * Publish is NOT part of the adapter ("Publish as new version" is its own flow
 * on the design draft), so `publish` returns a clear refusal and the config
 * sets `canPublish: false`. No revisions, no restore.
 */

import type {
  CompositionData,
  CompositionLoadResult,
  CompositionSaveInput,
  CompositionSaveResult,
  SaveDraftResult,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  coerceStyleClassRegistry,
  coerceStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-registry-coerce";
import type { ThemeDraftTree } from "@/lib/talent-site/theme-template/types";

import { assertNoLegacyBuilderWrite } from "../legacy-write-guard";
import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceSaveDraftInput,
} from "../surface-adapter";

/** The draft table this surface persists to (never a legacy slot table). */
export const THEME_TEMPLATE_TABLE = "talent_theme_drafts";

/** What `load` needs from a draft: one tree + its rev. */
export interface ThemeTemplateLoaded {
  design: string;
  tree: BuilderNodeTree;
  rev: number;
}

export type ThemeTemplateSaveOutcome =
  | { ok: true; rev: number }
  | { ok: false; error: string };

/** The DB seam, injected (production binds the "use server" actions). */
export interface ThemeTemplateAdapterActions {
  loadTree(input: {
    design: string;
    tree: ThemeDraftTree;
  }): Promise<{ ok: true; value: ThemeTemplateLoaded } | { ok: false; error: string }>;
  saveTree(input: {
    design: string;
    tree: ThemeDraftTree;
    nodes: BuilderNodeTree;
    expectedRev: number;
  }): Promise<ThemeTemplateSaveOutcome>;
}

export function buildThemeTemplateComposition(
  loaded: ThemeTemplateLoaded,
  locale: string,
): CompositionData {
  return {
    locale: locale as CompositionData["locale"],
    pageId: loaded.design,
    pageVersion: loaded.rev,
    liveSitePublishedAt: null,
    metadata: {
      title: loaded.design,
      metaTitle: null,
      metaDescription: null,
      introTagline: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: true,
      jsonLd: null,
    },
    slots: {},
    builderTree: Array.isArray(loaded.tree) ? loaded.tree : [],
    slotDefs: [],
    library: [],
    styleClasses: coerceStyleClassRegistry(null),
    stylePresets: coerceStylePresetRegistry(null),
    availableLocales: [locale as CompositionData["locale"]],
  };
}

export function createThemeTemplateAdapter(
  design: string,
  tree: ThemeDraftTree,
  actions: ThemeTemplateAdapterActions,
): BuilderSurfaceAdapter {
  async function persist(
    builderTree: BuilderNodeTree | undefined,
    expectedRev: number,
  ): Promise<CompositionSaveResult> {
    assertNoLegacyBuilderWrite("theme_template", THEME_TEMPLATE_TABLE);
    // A save with no tree (metadata-only) has nothing to write for a design.
    if (builderTree === undefined) return { ok: true, pageVersion: expectedRev };
    const outcome = await actions.saveTree({
      design,
      tree,
      nodes: builderTree,
      expectedRev,
    });
    if (!outcome.ok) return { ok: false, error: outcome.error };
    return { ok: true, pageVersion: outcome.rev };
  }

  return {
    kind: "theme_template",

    async load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      const res = await actions.loadTree({ design, tree });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, data: buildThemeTemplateComposition(res.value, ctx.locale) };
    },

    async save(
      _ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      return persist(input.builderTree, input.expectedVersion);
    },

    async saveDraft(
      _ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      const result = await persist(input.builderTree, input.expectedVersion);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: result.pageVersion,
        savedAt: new Date().toISOString(),
      };
    },

    async publish(
      _ctx: BuilderSurfaceContext,
      _input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      return {
        ok: false,
        error: "A talent design is released with Publish as new version, not from the editor.",
      };
    },
  };
}
