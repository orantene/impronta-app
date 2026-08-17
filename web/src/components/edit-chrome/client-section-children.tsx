"use client";

/**
 * ClientSectionChildren — builder-perf-2026 (curated-slot instant editing).
 *
 * On a CURATED-SLOT page, `homepage-cms-sections.tsx` renders each section as a
 * server `<Component>` (hero, featured-talent, …) PLUS its freeform / role-bound
 * builder CHILDREN via `renderBuilderNodes`. The children are where the common
 * edits live (a heading's colour/size/weight, a paragraph, an image). With the
 * server-render path, every such edit triggered a full `router.refresh()` — the
 * ~10s "reload".
 *
 * This wraps ONLY that children render and repaints it CLIENT-side from the live
 * tree the editor publishes to `client-builder-canvas-bridge`, so a child edit is
 * instant. It is the curated-slot analogue of `ClientBuilderCanvas` (which owns
 * the freeform full-page case) and obeys the SAME byte-identical contract:
 *   - calls the SAME `renderBuilderNodes` with the SAME options as the server, so
 *     every node emits identical `data-builder-node-id` wrappers the overlays use;
 *   - first client paint uses the server-resolved `initialChildren` (bridge starts
 *     empty), so hydration markup matches, then swaps to the live children;
 *   - `section_embed` islands stay server-rendered — pre-rendered by the server
 *     and returned by id via `sectionEmbedIslands`, never re-rendered client-side;
 *   - data-bound nodes render against the SERIALIZED `dataSources` snapshot.
 *
 * The curated server `<Component>` is NOT reflected here, so a curated-PROP edit
 * still refreshes (gated by the full-page-only signal in `edit-context`). Mounting
 * this only flips the SECTION-CHILDREN signal, which lets builder-node edits skip
 * the refresh while leaving curated-prop edits on the server path.
 *
 * Mounted behind the same gate as `ClientBuilderCanvas`: editMode &&
 * NEXT_PUBLIC_BUILDER_CLIENT_CANVAS. Flag off → the server children render exactly
 * as today.
 */
import { memo, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import {
  renderBuilderNodes,
  type BuilderNode,
  type BuilderNodeRenderDataSources,
  type BuilderNodeTree,
  type BuilderVisibilityContext,
} from "@/lib/site-admin/builder-node";
import type { ComponentDefinitions } from "@/lib/site-admin/builder-node/component-instances";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import { useComponentDefaultsPreview } from "./component-defaults-bridge";
import { registerCarouselEditMode } from "@/lib/site-admin/builder-node/carousel-edit-bridge";

import {
  getStyleClassRegistrySnapshot,
  getStyleClassRegistryServerSnapshot,
  subscribeStyleClassRegistry,
} from "@/lib/site-admin/builder-node/style-classes-storage";

import {
  getBuilderCanvasTreeSnapshot,
  registerSectionChildrenCanvasMount,
  subscribeBuilderCanvasTree,
} from "./client-builder-canvas-bridge";

/** Depth-first lookup of a node's `children` array by node id (or null if absent). */
function findChildrenById(
  tree: BuilderNodeTree,
  id: string,
): ReadonlyArray<BuilderNode> | null {
  for (const node of tree) {
    if (node.id === id) {
      return "children" in node && Array.isArray(node.children)
        ? node.children
        : [];
    }
    if ("children" in node && Array.isArray(node.children)) {
      const hit = findChildrenById(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export interface ClientSectionChildrenProps {
  /** The builder SECTION node whose children this renders (located in the live tree). */
  sectionNodeId: string;
  /** Server-resolved children, used until the bridge publishes — keeps hydration identical. */
  initialChildren: ReadonlyArray<BuilderNode>;
  /** Serialized data snapshot for data-bound child nodes — NOT re-fetched client-side. */
  dataSources: BuilderNodeRenderDataSources;
  /** Pre-rendered `section_embed` server islands within this section, keyed by node id. */
  sectionEmbedIslands: Readonly<Record<string, ReactNode>>;
  publicPathPrefix: string;
  components: ComponentDefinitions;
  visibilityContext?: BuilderVisibilityContext;
  /** GAP B — tenant LIVE per-component-type default styles (cascade middle layer). */
  componentStyleDefaults?: ComponentStyleDefaults;
}

function ClientSectionChildrenInner({
  sectionNodeId,
  initialChildren,
  dataSources,
  sectionEmbedIslands,
  publicPathPrefix,
  components,
  visibilityContext,
  componentStyleDefaults,
}: ClientSectionChildrenProps): ReactNode {
  // builder-perf-2026 — announce a section-children canvas is mounted so
  // `edit-context` lets builder-node edits skip the per-edit refresh.
  useEffect(() => registerSectionChildrenCanvasMount(), []);

  // SLIDER-1 — same edit-mode signal the page canvas registers: a hero carousel
  // living inside a curated section must not autoplay while it is being edited.
  useEffect(() => registerCarouselEditMode(), []);

  // Subscribe to the live tree but project to THIS section's children. Copy-on-write
  // keeps an untouched section's children ref stable, so `getSnapshot` returns the
  // same array unless THIS section changed → only the edited section re-renders.
  // Bridge starts null (server + first client render) → `initialChildren`, so the
  // first paint matches the server markup, then swaps to the live children.
  const getChildrenSnapshot = useCallback((): ReadonlyArray<BuilderNode> => {
    const tree = getBuilderCanvasTreeSnapshot();
    if (!tree) return initialChildren;
    return findChildrenById(tree, sectionNodeId) ?? initialChildren;
  }, [sectionNodeId, initialChildren]);

  const children = useSyncExternalStore(
    subscribeBuilderCanvasTree,
    getChildrenSnapshot,
    () => initialChildren,
  );

  // Live linked-style-class registry (matches ClientBuilderCanvas) — empty on the
  // server snapshot so hydration stays byte-identical, then applied on the client.
  const styleClasses = useSyncExternalStore(
    subscribeStyleClassRegistry,
    getStyleClassRegistrySnapshot,
    getStyleClassRegistryServerSnapshot,
  );

  const renderSectionEmbed = useCallback(
    (node: BuilderNode): ReactNode => sectionEmbedIslands[node.id] ?? null,
    [sectionEmbedIslands],
  );

  // GAP B-4 — live-preview the operator's DRAFT component defaults while editing;
  // fall back to the server-resolved LIVE defaults prop otherwise.
  const draftComponentDefaults = useComponentDefaultsPreview();
  const effectiveComponentDefaults =
    draftComponentDefaults ?? componentStyleDefaults;

  // Stable options identity so the renderer's `BuilderNodeView` memo can bail
  // unchanged subtrees (same rationale as ClientBuilderCanvas). Mirrors the SAME
  // option set the server passes for section children at the call site.
  const options = useMemo(
    () => ({
      publicPathPrefix,
      mode: "freeform" as const,
      includeRendererStyles: false,
      dataSources,
      components,
      visibilityContext,
      styleClasses,
      componentStyleDefaults: effectiveComponentDefaults,
      renderSectionEmbed,
      animateLayout: true,
    }),
    [
      publicPathPrefix,
      dataSources,
      components,
      visibilityContext,
      styleClasses,
      effectiveComponentDefaults,
      renderSectionEmbed,
    ],
  );

  return renderBuilderNodes(children, options);
}

export const ClientSectionChildren = memo(ClientSectionChildrenInner);
