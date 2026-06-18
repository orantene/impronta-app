import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node";
import {
  filterBulkStylePatchForNode,
  type MultiSelectionBucket,
} from "@/lib/site-admin/builder-node/multi-selection-style";

export type MultiNodeAlignMode =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

export type MultiNodeDistributeMode = "horizontal" | "vertical";

export interface MultiNodeRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TranslateDelta {
  x: number;
  y: number;
}

export function parseTranslateValue(value: unknown): TranslateDelta {
  if (typeof value !== "string" || !value.trim() || value === "none") {
    return { x: 0, y: 0 };
  }
  const [rawX, rawY] = value.trim().split(/\s+/);
  return {
    x: Number.parseFloat(rawX ?? "0") || 0,
    y: Number.parseFloat(rawY ?? "0") || 0,
  };
}

export function formatTranslateValue(delta: TranslateDelta): string | null {
  const x = Math.round(delta.x);
  const y = Math.round(delta.y);
  return x === 0 && y === 0 ? null : `${x}px ${y}px`;
}

export function selectionBounds(rects: ReadonlyArray<MultiNodeRect>): MultiNodeRect | null {
  if (rects.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.left + rect.width);
    bottom = Math.max(bottom, rect.top + rect.height);
  }
  return {
    id: "__selection_bounds__",
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function computeAlignDeltas(
  rects: ReadonlyArray<MultiNodeRect>,
  mode: MultiNodeAlignMode,
): Record<string, TranslateDelta> {
  const bounds = selectionBounds(rects);
  if (!bounds) return {};
  const out: Record<string, TranslateDelta> = {};
  for (const rect of rects) {
    let x = 0;
    let y = 0;
    if (mode === "left") x = bounds.left - rect.left;
    if (mode === "center") {
      x = bounds.left + bounds.width / 2 - (rect.left + rect.width / 2);
    }
    if (mode === "right") {
      x = bounds.left + bounds.width - (rect.left + rect.width);
    }
    if (mode === "top") y = bounds.top - rect.top;
    if (mode === "middle") {
      y = bounds.top + bounds.height / 2 - (rect.top + rect.height / 2);
    }
    if (mode === "bottom") {
      y = bounds.top + bounds.height - (rect.top + rect.height);
    }
    out[rect.id] = { x, y };
  }
  return out;
}

export function computeDistributeDeltas(
  rects: ReadonlyArray<MultiNodeRect>,
  mode: MultiNodeDistributeMode,
): Record<string, TranslateDelta> {
  if (rects.length < 3) return {};
  const axis = mode === "horizontal" ? "x" : "y";
  const sorted = [...rects].sort((a, b) =>
    mode === "horizontal" ? a.left - b.left : a.top - b.top,
  );
  const start = mode === "horizontal" ? sorted[0]!.left : sorted[0]!.top;
  const endRect = sorted[sorted.length - 1]!;
  const end =
    mode === "horizontal" ? endRect.left + endRect.width : endRect.top + endRect.height;
  const totalSize = sorted.reduce(
    (sum, rect) => sum + (mode === "horizontal" ? rect.width : rect.height),
    0,
  );
  const gap = (end - start - totalSize) / (sorted.length - 1);
  let cursor = start;
  const out: Record<string, TranslateDelta> = {};
  for (const rect of sorted) {
    const current = mode === "horizontal" ? rect.left : rect.top;
    const delta = cursor - current;
    out[rect.id] = axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta };
    cursor += (mode === "horizontal" ? rect.width : rect.height) + gap;
  }
  return out;
}

export function addTranslateDeltaToTree(
  tree: BuilderNodeTree,
  deltas: Readonly<Record<string, TranslateDelta>>,
): BuilderNodeTree {
  let changed = false;
  const visit = (node: BuilderNode): BuilderNode => {
    let nextNode = node;
    const delta = deltas[node.id];
    if (delta && node.kind !== "section") {
      const props = { ...(node.props as Record<string, unknown>) };
      const style = { ...((props.style as Record<string, unknown> | undefined) ?? {}) };
      const current = parseTranslateValue(style.translate);
      const nextTranslate = formatTranslateValue({
        x: current.x + delta.x,
        y: current.y + delta.y,
      });
      if (nextTranslate) {
        style.translate = nextTranslate;
      } else {
        delete style.translate;
      }
      if (Object.keys(style).length > 0) {
        props.style = style;
      } else {
        delete props.style;
      }
      nextNode = { ...node, props } as BuilderNode;
      changed = true;
    }
    if ("children" in nextNode && Array.isArray(nextNode.children)) {
      const nextChildren = nextNode.children.map(visit);
      if (nextChildren.some((child, index) => child !== nextNode.children![index])) {
        changed = true;
        return { ...nextNode, children: nextChildren } as BuilderNode;
      }
    }
    return nextNode;
  };
  const nextTree = tree.map(visit);
  return changed ? nextTree : tree;
}

/** Apply a (already lock-filtered) style patch onto a style object in place. */
function applyStylePatchKeys(
  style: Record<string, unknown>,
  patch: Readonly<Record<string, unknown>>,
): void {
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === undefined) {
      delete style[key];
    } else {
      style[key] = value;
    }
  }
}

/**
 * Job #28 (bulk edit) / INS-2 (Mixed-state inspector) — merge one `style` patch
 * into EVERY node in `nodeIds`, returning a new tree (immutable, like
 * {@link addTranslateDeltaToTree}).
 *
 * Twin of the translate helper so multi-select "edit shared style for all at
 * once" rides the SAME atomic `patch` op + undo path as align/distribute, with
 * no parallel mutation system. Semantics, matched to `cleanBuilderNodeStyle`'s
 * explicit-undefined convention used across the style system:
 *   - a key set to a non-undefined value  → written onto the node's style
 *   - a key set to `undefined`            → DELETED from the node's style
 *     (so a "clear" control resets the prop for the whole selection)
 * Section nodes + nodes not in the set are left byte-identical; an empty
 * resulting `style` object is dropped from props entirely (no `style: {}`
 * residue), exactly as the translate helper does.
 *
 * INS-2 additions (kept back-compat for the base-bucket / no-lock case):
 *   - `bucket` (`"tablet"`/`"mobile"`) writes into `style.responsive[bucket]`
 *     instead of the top-level style, so the Mixed inspector can bulk-edit a
 *     responsive override. `null` (default) is the existing base behavior.
 *   - PER-NODE LOCK GUARD — each node's own INS-1 `lockedProps` are stripped
 *     from the patch via `filterBulkStylePatchForNode` BEFORE it is applied, so
 *     a bulk edit can never bypass a prop locked on one of the selected nodes.
 *     A node that locks every patched key is left byte-identical.
 */
export function mergeStylePatchIntoTree(
  tree: BuilderNodeTree,
  nodeIds: ReadonlyArray<string>,
  patch: Readonly<Record<string, unknown>>,
  bucket: MultiSelectionBucket = null,
): BuilderNodeTree {
  const idSet = new Set(nodeIds);
  if (idSet.size === 0 || Object.keys(patch).length === 0) return tree;
  let changed = false;
  const visit = (node: BuilderNode): BuilderNode => {
    let nextNode = node;
    if (idSet.has(node.id) && node.kind !== "section") {
      // INS-1 lock guard — drop any patched key this node locks before writing.
      const nodePatch = filterBulkStylePatchForNode(patch, node, bucket);
      if (Object.keys(nodePatch).length > 0) {
        const props = { ...(node.props as Record<string, unknown>) };
        const style = {
          ...((props.style as Record<string, unknown> | undefined) ?? {}),
        };
        if (bucket == null) {
          applyStylePatchKeys(style, nodePatch);
        } else {
          const responsive = {
            ...((style.responsive as Record<string, unknown> | undefined) ?? {}),
          };
          const tier = {
            ...((responsive[bucket] as Record<string, unknown> | undefined) ?? {}),
          };
          applyStylePatchKeys(tier, nodePatch);
          if (Object.keys(tier).length > 0) {
            responsive[bucket] = tier;
          } else {
            delete responsive[bucket];
          }
          if (Object.keys(responsive).length > 0) {
            style.responsive = responsive;
          } else {
            delete style.responsive;
          }
        }
        if (Object.keys(style).length > 0) {
          props.style = style;
        } else {
          delete props.style;
        }
        nextNode = { ...node, props } as BuilderNode;
        changed = true;
      }
    }
    if ("children" in nextNode && Array.isArray(nextNode.children)) {
      const nextChildren = nextNode.children.map(visit);
      if (nextChildren.some((child, index) => child !== nextNode.children![index])) {
        changed = true;
        return { ...nextNode, children: nextChildren } as BuilderNode;
      }
    }
    return nextNode;
  };
  const nextTree = tree.map(visit);
  return changed ? nextTree : tree;
}
