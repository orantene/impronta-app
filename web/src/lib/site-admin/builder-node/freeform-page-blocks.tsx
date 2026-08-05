/**
 * Freeform page root rendering — paints every top-level `builderTree` block on
 * the canvas, including Add Gallery custom sections (`kind: section`,
 * `sectionTypeKey: custom`). The generic `renderBuilderNodes` path skips
 * `section` nodes in freeform mode, so gallery inserts were invisible on
 * slot-free pages until this helper wraps and renders their children.
 */
import type { ReactNode } from "react";

import { renderBuilderNodes, type BuilderNodeRenderOptions } from "./render";
import {
  collectUnboundRootGalleryBlocks,
  isUnboundGallerySectionNode,
  isUnboundRootGalleryBlock,
} from "./snapshot-tree";
import type { BuilderNode, BuilderNodeTree } from "./types";

/**
 * PERF (A2) — per-root-block nested render options, cached by caller identity.
 *
 * Every root block used to spread a FRESH `{ ...options, includeRendererStyles:
 * false, includeFontLinks: false }` object into `renderBuilderNodes`. The
 * renderer's only memo boundary (`BuilderNodeView`) compares
 * `Object.is(prev.options, next.options)`, so a fresh object per block per
 * render defeated it: the entire page rebuilt its vdom on every commit even
 * though `ClientBuilderCanvas` hands us a stable memoized `options`.
 *
 * The derived object is a pure function of `options`, so it is cached in a
 * `WeakMap` keyed by the caller's object — a stable caller now yields ONE
 * shared nested-options reference for all root blocks across all renders.
 * The produced object is field-identical to the old inline spread, so render
 * output is unchanged.
 */
const nestedRootOptionsCache = new WeakMap<
  BuilderNodeRenderOptions,
  BuilderNodeRenderOptions
>();

function nestedRootOptions(
  options: BuilderNodeRenderOptions,
): BuilderNodeRenderOptions {
  const cached = nestedRootOptionsCache.get(options);
  if (cached) return cached;
  const derived: BuilderNodeRenderOptions = {
    ...options,
    includeRendererStyles: false,
    includeFontLinks: false,
  };
  nestedRootOptionsCache.set(options, derived);
  return derived;
}

export function renderUnboundGallerySectionBlock(
  sectionNode: Extract<BuilderNode, { kind: "section" }>,
  blockIndex: number,
  options: BuilderNodeRenderOptions,
): ReactNode {
  const label = sectionNode.props.label?.trim() || "Section";
  const children = sectionNode.children ?? [];
  return (
    <div
      key={`gallery:${sectionNode.id}`}
      data-cms-section=""
      data-cms-block=""
      data-block-index={blockIndex}
      data-builder-node-id={sectionNode.id}
      data-section-type-key="custom"
      data-section-label={label}
    >
      {renderBuilderNodes(children, nestedRootOptions(options))}
    </div>
  );
}

/** Paint one root-level gallery / freeform block (container, split, legacy section…). */
export function renderUnboundRootGalleryBlock(
  node: BuilderNode,
  blockIndex: number,
  options: BuilderNodeRenderOptions,
): ReactNode {
  if (isUnboundGallerySectionNode(node)) {
    return renderUnboundGallerySectionBlock(node, blockIndex, options);
  }
  return (
    <div
      key={`block:${node.id}`}
      data-cms-block=""
      data-block-index={blockIndex}
      data-cms-block-node-id={node.id}
    >
      {renderBuilderNodes([node], nestedRootOptions(options))}
    </div>
  );
}

/**
 * Render the full freeform page root in `builderTree` order. Each root node
 * emits `data-cms-block` + `data-block-index` so drag-drop and between-block
 * inserts can target the correct root index.
 */
export function renderFreeformPageRootTree(
  tree: BuilderNodeTree,
  options: BuilderNodeRenderOptions,
): ReactNode {
  if (tree.length === 0) return null;
  const blocks: ReactNode[] = [];
  for (let blockIndex = 0; blockIndex < tree.length; blockIndex += 1) {
    const node = tree[blockIndex]!;
    if (isUnboundRootGalleryBlock(node)) {
      blocks.push(renderUnboundRootGalleryBlock(node, blockIndex, options));
      continue;
    }
    blocks.push(
      <div
        key={`block:${node.id}`}
        data-cms-block=""
        data-block-index={blockIndex}
        data-cms-block-node-id={node.id}
      >
        {renderBuilderNodes([node], nestedRootOptions(options))}
      </div>,
    );
  }
  return blocks.length === 1 ? blocks[0] : blocks;
}

/** Paint only Add Gallery custom root blocks (composition-slot pages). */
export function renderUnboundGalleryRoots(
  tree: BuilderNodeTree,
  options: BuilderNodeRenderOptions,
): ReactNode {
  const unbound = collectUnboundRootGalleryBlocks(tree);
  if (unbound.length === 0) return null;
  return (
    <>
      {unbound.map((blockNode) => {
        const rootIndex = tree.findIndex((node) => node.id === blockNode.id);
        return renderUnboundRootGalleryBlock(
          blockNode,
          rootIndex >= 0 ? rootIndex : 0,
          options,
        );
      })}
    </>
  );
}
