import type { BuilderNode, BuilderNodeStyle, BuilderNodeTree } from "./types";
import { cloneNodeWithFreshIds } from "./operations";
import {
  buildBuilderNodeRoleBindings,
  resolveBuilderNodeRole,
  type BuilderNodeRole,
} from "./role-bindings";
import { nodePresentationToBuilderStyle } from "./node-presentation-bridge";
import type { NodePresentation } from "../sections/shared/node-presentation";
import type { EjectRoleBaseline } from "./section-eject-baseline";

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
 * Layer `over` on top of `base`, deep-merging the per-breakpoint responsive
 * buckets so an upper layer's tablet/mobile values refine rather than clobber
 * the lower layer's.
 */
export function layerBuilderNodeStyles(
  base: BuilderNodeStyle | undefined,
  over: BuilderNodeStyle | undefined,
): BuilderNodeStyle | undefined {
  if (!base) return over;
  if (!over) return base;
  const merged: BuilderNodeStyle = { ...base, ...over };
  if (base.responsive || over.responsive) {
    const buckets: NonNullable<BuilderNodeStyle["responsive"]> = {
      ...base.responsive,
      ...over.responsive,
    };
    if (base.responsive?.tablet && over.responsive?.tablet) {
      buckets.tablet = { ...base.responsive.tablet, ...over.responsive.tablet };
    }
    if (base.responsive?.mobile && over.responsive?.mobile) {
      buckets.mobile = { ...base.responsive.mobile, ...over.responsive.mobile };
    }
    merged.responsive = buckets;
  }
  return merged;
}

/**
 * Merge the curated layers UNDER a child's existing style. Bottom-up:
 *   1. the section's CSS baseline for the role (the curated component's OWN
 *      look — `section-eject-baseline.ts`), then
 *   2. the role's translated `nodePresentation` (the operator's curated
 *      "Type & color overrides"), then
 *   3. an explicit Engine-A style prop already set on the child.
 * CSS author intent throughout: a directly-edited value beats the curated
 * override, which beats the curated default.
 */
function applyRolePresentationToChild(
  child: BuilderNode,
  rolePresentation: EjectRolePresentation,
  roleBaseline?: EjectRoleBaseline,
): BuilderNode {
  const role = resolveBuilderNodeRole(child.id);
  if (!role) return child;
  const curated = resolveCuratedRoleStyle(role, rolePresentation, roleBaseline);
  if (!curated) return child;
  const existing = (child.props as { style?: BuilderNodeStyle }).style;
  const mergedStyle = layerBuilderNodeStyles(
    curated,
    existing,
  ) as BuilderNodeStyle;
  return {
    ...child,
    props: { ...(child.props as Record<string, unknown>), style: mergedStyle },
  } as BuilderNode;
}

/**
 * The curated style for ONE role: the section's CSS baseline with the
 * operator's saved per-role `nodePresentation` layered over it. This is the
 * value that goes UNDER a child's explicit style — shared verbatim with the
 * REPAIR path (`section-eject-repair.ts`) so an already-unlocked section can
 * regain exactly the styling a fresh unlock would have baked in, with the same
 * precedence. Returns `undefined` when the role carries neither layer.
 */
export function resolveCuratedRoleStyle(
  role: BuilderNodeRole,
  rolePresentation: EjectRolePresentation,
  roleBaseline?: EjectRoleBaseline,
): BuilderNodeStyle | undefined {
  const np = rolePresentation[role];
  const baseline = roleBaseline?.[role];
  // `nodePresentation` is the full schema (with a `breakpoints` wrapper); the
  // desktop layer is the top-level value. Translate it to a BuilderNodeStyle.
  let translated: BuilderNodeStyle | undefined;
  if (np) {
    const baseLayer = nodePresentationToBuilderStyle(np);
    // Carry the per-breakpoint overrides onto BuilderNodeStyle.responsive so
    // the ejected freeform node keeps its tablet/mobile tuning too.
    const responsive: BuilderNodeStyle["responsive"] = {};
    if (np.breakpoints?.tablet) {
      responsive.tablet = nodePresentationToBuilderStyle(np.breakpoints.tablet);
    }
    if (np.breakpoints?.mobile) {
      responsive.mobile = nodePresentationToBuilderStyle(np.breakpoints.mobile);
    }
    translated =
      Object.keys(responsive).length > 0
        ? { ...baseLayer, responsive }
        : baseLayer;
    if (Object.keys(translated).length === 0) translated = undefined;
  }
  const curated = layerBuilderNodeStyles(baseline, translated);
  if (!curated || Object.keys(curated).length === 0) return undefined;
  return curated;
}

/**
 * Stamp the curated role a child was minted from onto the node itself
 * (`props.originRole` + the validate-carried base mirror), so the link
 * survives the re-mint that strips it from the id. See `BuilderNodeBase.originRole`.
 */
function stampOriginRole<T extends BuilderNode>(child: T, role: BuilderNodeRole): T {
  // Generic, so the spread keeps the concrete union member. Widening to the
  // BuilderNode union first makes the props bag unassignable to every variant.
  return {
    ...child,
    originRole: role,
    props: { ...(child.props as Record<string, unknown>), originRole: role },
  } as T;
}

export function ejectSectionInTree(
  tree: BuilderNodeTree,
  sectionNodeId: string,
  rolePresentation?: EjectRolePresentation,
  roleBaseline?: EjectRoleBaseline,
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
        const styled =
          rolePresentation || roleBaseline
            ? applyRolePresentationToChild(
                child,
                rolePresentation ?? {},
                roleBaseline,
              )
            : child;
        // #1178 — stamp the provenance BEFORE the re-mint drops the role from
        // the id, unconditionally (it costs nothing and is the only thing that
        // makes "Restore original styling" exact for this section later).
        const role = resolveBuilderNodeRole(child.id);
        return cloneNodeWithFreshIds(
          role ? stampOriginRole(styled, role) : styled,
        );
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
 * W4-T3 — resolve the saved per-role `nodePresentation` for a section node so
 * `ejectSectionInTree` can carry the user's Design-panel styling onto the
 * ejected children. Best-effort BY CONTRACT: any miss (not a section node, no
 * `sectionId`, loader failure, no `nodePresentation` on the saved props)
 * resolves to `undefined` and the caller falls through to the lossy eject —
 * eject itself must never throw or become a no-op over styling. The section
 * loader is injected so this module stays free of server-action imports.
 */
export async function resolveEjectRolePresentation(
  node: BuilderNode | null | undefined,
  loadSectionProps: (
    sectionId: string,
  ) => Promise<Record<string, unknown> | null>,
): Promise<EjectRolePresentation | undefined> {
  if (!node || node.kind !== "section") return undefined;
  const sectionId =
    typeof node.props.sectionId === "string" ? node.props.sectionId : null;
  if (!sectionId) return undefined;
  try {
    const props = await loadSectionProps(sectionId);
    const byRole = props?.nodePresentation as
      | Readonly<Partial<Record<string, NodePresentation | null | undefined>>>
      | undefined;
    if (!byRole) return undefined;
    return buildEjectRolePresentation(
      (node.children ?? []).map((child) => child.id),
      byRole,
    );
  } catch {
    return undefined;
  }
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
