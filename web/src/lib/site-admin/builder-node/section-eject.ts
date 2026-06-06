import type { BuilderNode, BuilderNodeStyle, BuilderNodeTree } from "./types";
import { cloneNodeWithFreshIds } from "./operations";
import {
  buildBuilderNodeRoleBindings,
  resolveBuilderNodeRole,
  type BuilderNodeRole,
} from "./role-bindings";
import { nodePresentationToBuilderStyle } from "./node-presentation-bridge";
import type { NodePresentation } from "../sections/shared/node-presentation";

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

/**
 * Per-role `nodePresentation` for the section being ejected — the curated
 * "Type & color overrides" keyed by role (`headline`/`subheadline`/…). This
 * lives in the section's curated CONFIG, not on the tree node, so the caller
 * must hand it in for a LOSSLESS eject. Optional + back-compat: omitting it
 * reproduces the old (lossy) behaviour exactly — every existing 2-arg caller is
 * unchanged.
 */
export type EjectRolePresentation = Readonly<
  Partial<Record<BuilderNodeRole, NodePresentation | null | undefined>>
>;

/**
 * Merge a role's translated `nodePresentation` UNDER a child's existing style.
 * Engine-B base layers first; an explicit Engine-A style prop set on the child
 * wins (CSS author intent — a directly-edited value beats the curated default).
 */
function applyRolePresentationToChild(
  child: BuilderNode,
  rolePresentation: EjectRolePresentation,
): BuilderNode {
  const role = resolveBuilderNodeRole(child.id);
  if (!role) return child;
  const np = rolePresentation[role];
  if (!np) return child;
  // `nodePresentation` is the full schema (with a `breakpoints` wrapper); the
  // desktop layer is the top-level value. Translate it to a BuilderNodeStyle.
  const baseLayer = nodePresentationToBuilderStyle(np);
  if (Object.keys(baseLayer).length === 0) return child;
  // Carry the per-breakpoint overrides onto BuilderNodeStyle.responsive so the
  // ejected freeform node keeps its tablet/mobile tuning too.
  const responsive: BuilderNodeStyle["responsive"] = {};
  if (np.breakpoints?.tablet) {
    responsive.tablet = nodePresentationToBuilderStyle(np.breakpoints.tablet);
  }
  if (np.breakpoints?.mobile) {
    responsive.mobile = nodePresentationToBuilderStyle(np.breakpoints.mobile);
  }
  const translated: BuilderNodeStyle =
    Object.keys(responsive).length > 0 ? { ...baseLayer, responsive } : baseLayer;
  const existing = (child.props as { style?: BuilderNodeStyle }).style;
  const mergedStyle: BuilderNodeStyle = existing
    ? {
        ...translated,
        ...existing,
        // Deep-merge the responsive layer so a child's explicit per-breakpoint
        // style does not wholesale-clobber the curated one.
        ...(translated.responsive || existing.responsive
          ? {
              responsive: {
                ...translated.responsive,
                ...existing.responsive,
              },
            }
          : {}),
      }
    : translated;
  return {
    ...child,
    props: { ...(child.props as Record<string, unknown>), style: mergedStyle },
  } as BuilderNode;
}

export function ejectSectionInTree(
  tree: BuilderNodeTree,
  sectionNodeId: string,
  rolePresentation?: EjectRolePresentation,
): EjectSectionResult {
  let ejected = false;
  const next = tree.map((node) => {
    if (
      node.id === sectionNodeId &&
      node.kind === "section" &&
      !node.props.ejected
    ) {
      ejected = true;
      const roleless = (node.children ?? []).map((child) => {
        // W4-T3: translate the role's curated `nodePresentation` onto the
        // child's BuilderNodeStyle (via the W4-T1 bridge) BEFORE re-minting, so
        // the role is still resolvable from its `legacy:…:role` id. Without
        // this, eject silently drops all per-role align/size/font/color tuning.
        const styled = rolePresentation
          ? applyRolePresentationToChild(child, rolePresentation)
          : child;
        return cloneNodeWithFreshIds(styled);
      });
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
 * Helper for callers: from a section's child node ids + its curated
 * `nodePresentation` config, build the role→presentation map this function
 * needs. (The role binding is resolved the same way the renderer resolves it,
 * via `buildBuilderNodeRoleBindings`.) Pure.
 */
export function buildEjectRolePresentation(
  childNodeIds: ReadonlyArray<string>,
  nodePresentationByRole:
    | Readonly<Partial<Record<string, NodePresentation | null | undefined>>>
    | null
    | undefined,
): EjectRolePresentation {
  if (!nodePresentationByRole) return {};
  const { nodeIdsByRole } = buildBuilderNodeRoleBindings(childNodeIds);
  const out: Partial<Record<BuilderNodeRole, NodePresentation | null | undefined>> =
    {};
  for (const role of Object.keys(nodeIdsByRole) as BuilderNodeRole[]) {
    const np = nodePresentationByRole[role];
    if (np) out[role] = np;
  }
  return out;
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
