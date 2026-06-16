/**
 * In-editor canvas render data (server) — assembles the serializable inputs the
 * `<ClientBuilderCanvas>` needs to paint a freeform tree on the NON-homepage
 * builder surfaces (cms_page / talent_page / platform_lab).
 *
 * The homepage already builds this inline in `homepage-cms-sections.tsx`; this
 * module factors out the SAME assembly for the surfaces that mount the editor
 * via `BuilderEditorMount` (which renders only chrome, no storefront body). It
 * reuses the exact homepage loaders/renderers — it does NOT reimplement any
 * renderer:
 *   - `loadBuilderNodeDataSources` — serialized data snapshot for data-bound
 *     nodes (featured talent / locations / directory / media / collections),
 *     scoped to the preview subject when one is set.
 *   - `collectBuilderSectionEmbedNodes` + `makeSectionEmbedRenderer` —
 *     pre-renders each `section_embed` server island once, keyed by node id, so
 *     curated sections stay server-rendered while the rest paints client-side.
 *   - `loadPublicComponentStyleDefaults` — the tenant's LIVE per-component-type
 *     default styles (cascade middle layer).
 *
 * This is async SERVER code. It must be called from a server component (the
 * route page hosting each builder surface) and the result threaded down as a
 * prop. `sectionEmbedIslands` are React nodes carried across the RSC boundary
 * (the same way the homepage hands them to the client canvas).
 */

import type { ReactNode } from "react";

import {
  collectBuilderSectionEmbedNodes,
  makeSectionEmbedRenderer,
} from "@/lib/site-admin/builder-node/section-embed-renderer";
import type {
  BuilderNodeRenderDataSources,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import { loadPublicComponentStyleDefaults } from "@/lib/site-admin/server/reads";
import { loadBuilderNodeDataSources } from "@/components/home/homepage-cms-data-sources";

/** In-editor preview subject (Builder Lab / talent + workspace surfaces). */
export interface InEditorCanvasPreviewSubject {
  kind: string;
  id: string;
  locale?: string;
}

/**
 * Everything the in-editor `<ClientBuilderCanvas>` needs, assembled on the
 * server. `sectionEmbedIslands` values are pre-rendered server React nodes
 * (RSC-carried), keyed by builder node id.
 */
export interface InEditorCanvasRenderData {
  dataSources: BuilderNodeRenderDataSources;
  sectionEmbedIslands: Readonly<Record<string, ReactNode>>;
  componentStyleDefaults: ComponentStyleDefaults;
  publicPathPrefix: string;
  /**
   * Surface-scoped LIVE design tokens to paint on the in-editor canvas root at
   * first paint (talent_page surface → the talent's published theme). Empty when
   * the surface has no own tokens — the canvas then inherits the host `<html>`
   * tokens. The Theme drawer's preview bridge overlays the DRAFT live on top.
   */
  designTokens: Record<string, string>;
}

export async function buildInEditorCanvasRenderData(args: {
  /** The freeform tree being edited (the surface's saved page body). */
  tree: BuilderNodeTree;
  /** Active tenant id (builder credentials / asset scope). */
  tenantId: string;
  /** Locale the editor edits in. */
  locale: string;
  /** Path prefix for tenant-scoped hrefs. Defaults to "" (the homepage default). */
  publicPathPrefix?: string;
  /**
   * Subject the connected/data-bound + section_embed nodes hydrate against.
   * Null/omitted → the active tenant (homepage behaviour).
   */
  previewSubject?: InEditorCanvasPreviewSubject | null;
  /**
   * Surface-scoped per-component-type default styles to use INSTEAD of the
   * tenant's `loadPublicComponentStyleDefaults`. The talent_page surface passes
   * the talent's OWN LIVE component-style defaults (from
   * `talent_pages.theme.__design.componentStyles`) so the first paint matches
   * the talent's theme, not the host tenant's. Omitted/empty → tenant defaults.
   */
  componentStyleDefaultsOverride?: ComponentStyleDefaults | null;
  /**
   * Surface-scoped LIVE design tokens to paint on the canvas root at first paint
   * (talent_page → the talent's published theme tokens). Omitted → empty (inherit
   * the host `<html>` tokens).
   */
  designTokens?: Record<string, string> | null;
}): Promise<InEditorCanvasRenderData> {
  const {
    tree,
    tenantId,
    locale,
    publicPathPrefix = "",
    previewSubject = null,
    componentStyleDefaultsOverride = null,
    designTokens = null,
  } = args;

  const subjectForSectionEmbed:
    | { kind: "talent" | "workspace"; id: string; locale?: string }
    | null =
    previewSubject?.kind === "talent" || previewSubject?.kind === "workspace"
      ? {
          kind: previewSubject.kind,
          id: previewSubject.id,
          locale: previewSubject.locale,
        }
      : null;

  const useOverride =
    componentStyleDefaultsOverride !== null &&
    Object.keys(componentStyleDefaultsOverride).length > 0;

  const [dataSources, tenantComponentStyleDefaults] = await Promise.all([
    loadBuilderNodeDataSources(
      tree,
      tenantId,
      locale,
      previewSubject ? { kind: previewSubject.kind, id: previewSubject.id } : null,
    ),
    // Skip the tenant read entirely when a surface override is supplied.
    useOverride
      ? Promise.resolve({} as ComponentStyleDefaults)
      : loadPublicComponentStyleDefaults(tenantId),
  ]);

  const componentStyleDefaults = useOverride
    ? componentStyleDefaultsOverride
    : tenantComponentStyleDefaults;

  const sectionEmbedRenderer = makeSectionEmbedRenderer({
    tenantId,
    locale,
    publicPathPrefix,
    previewSubject: subjectForSectionEmbed,
    // WS-A A5 — this is the in-editor CANVAS render. Interactive header-widget
    // embeds render their static placeholder here (no live widget / auth read).
    editorMode: true,
  });

  const sectionEmbedIslands: Record<string, ReactNode> = {};
  for (const embed of collectBuilderSectionEmbedNodes(tree)) {
    sectionEmbedIslands[embed.id] = sectionEmbedRenderer(embed);
  }

  return {
    dataSources,
    sectionEmbedIslands,
    componentStyleDefaults,
    publicPathPrefix,
    designTokens: designTokens ?? {},
  };
}
