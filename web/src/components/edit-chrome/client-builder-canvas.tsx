"use client";

/**
 * ClientBuilderCanvas — W3 Sub-step B.
 *
 * Renders the freeform builder tree CLIENT-side via the pure, hookless,
 * client-safe `renderBuilderNodes` (`builder-node/render.tsx`). This is the
 * foundation for instant in-place repaints (Sub-step C wires mutations to it;
 * Sub-step D removes the per-edit `router.refresh()`).
 *
 * MOUNTED BEHIND A FLAG. The server (`homepage-cms-sections.tsx`) only mounts
 * this when `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` is on AND edit mode is active.
 * With the flag off the body renders 100% server-side — byte-identical to today.
 *
 * Byte-identical contract (why it can swap in without breaking overlays /
 * hydration):
 *   - It calls the SAME `renderBuilderNodes` the server calls, with the SAME
 *     render options, so every node emits identical `data-builder-node-id` +
 *     wrapper nesting that the canvas overlays (`querySelectorAll
 *     [data-builder-node-id]` + `getBoundingClientRect`) depend on.
 *   - Data-bound nodes (featured-talent / directory / locations / collections /
 *     media) render against a SERIALIZED `dataSources` snapshot produced once on
 *     the server. They are NOT re-fetched on the client.
 *   - `section_embed` nodes (async server-component islands) STAY server-
 *     rendered. The server pre-renders each island (with its own wrapper +
 *     `data-*`) and passes the React node by id in `sectionEmbedIslands`; the
 *     canvas's `renderSectionEmbed` returns that pre-rendered node verbatim, so
 *     the island HTML is preserved exactly.
 *
 * Cross-subtree data: the live tree comes from `client-builder-canvas-bridge`
 * (EditProvider publishes it). Until the bridge has a value (e.g. the very first
 * client render before the sibling EditProvider's publish effect runs) it falls
 * back to the server-resolved `initialTree`, which equals what the server would
 * have rendered — so the first client paint matches the server markup.
 */
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import {
  renderBuilderNodes,
  type BuilderNode,
  type BuilderNodeRenderDataSources,
  type BuilderNodeTree,
  type BuilderVisibilityContext,
} from "@/lib/site-admin/builder-node";
import type { ComponentDefinitions } from "@/lib/site-admin/builder-node/component-instances";

import {
  getStyleClassRegistrySnapshot,
  getStyleClassRegistryServerSnapshot,
  subscribeStyleClassRegistry,
} from "@/lib/site-admin/builder-node/style-classes-storage";

import {
  getBuilderCanvasTreeSnapshot,
  subscribeBuilderCanvasTree,
} from "./client-builder-canvas-bridge";

export interface ClientBuilderCanvasProps {
  /**
   * Server-resolved tree used until the in-memory bridge has published a value.
   * Equals the tree the server-render path would have used → first client paint
   * matches the server markup.
   */
  initialTree: BuilderNodeTree;
  /** Serialized data snapshot for data-bound nodes — NOT re-fetched client-side. */
  dataSources: BuilderNodeRenderDataSources;
  /**
   * Pre-rendered `section_embed` server islands, keyed by node id. Each value is
   * the SERVER render of that embed (wrapper + `data-*` + curated Component),
   * passed across the RSC boundary as a child. The canvas returns it verbatim.
   */
  sectionEmbedIslands: Readonly<Record<string, ReactNode>>;
  publicPathPrefix: string;
  /** Saved component definitions for linked instances (empty in edit mode). */
  components: ComponentDefinitions;
  /** Node-level conditional-visibility signals (undefined in edit mode). */
  visibilityContext?: BuilderVisibilityContext;
  /**
   * Whether to emit the shared `<BuilderNodeRendererStyles>` head sheet. The
   * server caller already emits it once (matching the server path), so this
   * defaults off to avoid a duplicate.
   */
  includeRendererStyles?: boolean;
}

export function ClientBuilderCanvas({
  initialTree,
  dataSources,
  sectionEmbedIslands,
  publicPathPrefix,
  components,
  visibilityContext,
  includeRendererStyles = false,
}: ClientBuilderCanvasProps): ReactNode {
  // Subscribe to the live in-memory tree published by EditProvider. The
  // server snapshot is `null` (the bridge starts empty), so we fall back to
  // `initialTree` on the server and on the first client render — keeping the
  // hydration markup identical — then swap to the live tree once published.
  const bridgedTree = useSyncExternalStore(
    subscribeBuilderCanvasTree,
    getBuilderCanvasTreeSnapshot,
    () => null,
  );
  const tree = bridgedTree ?? initialTree;

  // W1-T2(c) — subscribe to the live linked-style-class registry the editor
  // publishes (localStorage-backed). Threading it here makes linked blocks look
  // right ON the editor canvas, matching what publish now bakes into the live
  // site. SSR returns the empty registry (no localStorage), keeping first paint
  // byte-identical to the server markup.
  const styleClasses = useSyncExternalStore(
    subscribeStyleClassRegistry,
    getStyleClassRegistrySnapshot,
    getStyleClassRegistryServerSnapshot,
  );

  return renderBuilderNodes(tree, {
    publicPathPrefix,
    mode: "freeform",
    includeRendererStyles,
    dataSources,
    components,
    visibilityContext,
    styleClasses,
    // section_embed islands stay server-rendered: return the pre-rendered node.
    // An island we weren't handed (a tree-shape divergence) renders nothing
    // rather than attempting a client-side curated-section render.
    renderSectionEmbed: (node: BuilderNode) =>
      sectionEmbedIslands[node.id] ?? null,
  });
}
