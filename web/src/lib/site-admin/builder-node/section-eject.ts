import type { BuilderNode, BuilderNodeTree } from "./types";
import { cloneNodeWithFreshIds } from "./operations";

/**
 * "2018 bye-bye" — eject a curated section to freeform.
 *
 * A curated section renders a fixed React component plus DERIVED role-bound
 * builder children (ids like `legacy:…:heading:headline`) that the editor shows
 * but can only edit through the curated form. Ejecting re-mints those children
 * with fresh ROLELESS ids (so they become fully freeform — draggable, direct-
 * manipulable, every Style escape) and flags the section `ejected` so:
 *   - the renderer skips the curated component (homepage-cms-sections), and
 *   - the legacy hydration never re-derives role nodes into it (snapshot-tree).
 *
 * Pure (tree in → tree out). Reversible via unejectSectionInTree.
 */

export interface EjectSectionResult {
  tree: BuilderNodeTree;
  /** Whether a matching, not-already-ejected curated section was ejected. */
  ejected: boolean;
}

export function ejectSectionInTree(
  tree: BuilderNodeTree,
  sectionNodeId: string,
): EjectSectionResult {
  let ejected = false;
  const next = tree.map((node) => {
    if (
      node.id === sectionNodeId &&
      node.kind === "section" &&
      !node.props.ejected
    ) {
      ejected = true;
      const roleless = (node.children ?? []).map((child) =>
        cloneNodeWithFreshIds(child),
      );
      return {
        ...node,
        props: { ...node.props, ejected: true },
        children: roleless,
      } as BuilderNode;
    }
    return node;
  });
  return { tree: next, ejected };
}

/**
 * Reverse an eject: drop the `ejected` flag and clear the section's children so
 * the next hydration re-derives the original curated content. The curated React
 * component renders again. Pure.
 */
export function unejectSectionInTree(
  tree: BuilderNodeTree,
  sectionNodeId: string,
): EjectSectionResult {
  let ejected = false;
  const next = tree.map((node) => {
    if (
      node.id === sectionNodeId &&
      node.kind === "section" &&
      node.props.ejected
    ) {
      ejected = true;
      const props = { ...node.props };
      delete (props as { ejected?: boolean }).ejected;
      return { ...node, props, children: [] } as BuilderNode;
    }
    return node;
  });
  return { tree: next, ejected };
}
