import {
  resolveBuilderNodeRole,
  type BuilderNode,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";

/** Returns true when `nodeId` exists in the current reconciled tree (P7A-2 honest selection). */
export function treeContainsBuilderNodeId(
  tree: BuilderNodeTree,
  nodeId: string,
): boolean {
  return findBuilderNodeById(tree, nodeId) != null;
}

/**
 * P7A-2 — single source for "honest" builder child selection: never surface an
 * override id that is missing from the reconciled tree or owned by another
 * section (sync with `builderTree` / maps — no one-frame ghost id in context).
 */
export function resolveHonestSelectedBuilderNodeId(input: {
  selectedSectionId: string | null;
  selectedBuilderNodeIdOverride: string | null;
  builderTree: BuilderNodeTree;
  sectionIdByBuilderNodeId: ReadonlyMap<string, string>;
  builderNodeIdBySectionId: ReadonlyMap<string, string>;
}): string | null {
  const {
    selectedSectionId,
    selectedBuilderNodeIdOverride,
    builderTree,
    sectionIdByBuilderNodeId,
    builderNodeIdBySectionId,
  } = input;
  const override = selectedBuilderNodeIdOverride;
  // Freeform full-page designs have builder nodes with NO owner section, so
  // both the override's mapped section and `selectedSectionId` are null. Check
  // the override FIRST (works for section-owned AND section-less nodes) — the
  // old `if (!selectedSectionId) return null` bailed before this, so every
  // freeform block resolved to "nothing selected" even after selectBuilderNode.
  // (`?? null` so a missing map entry compares equal to a null section.)
  if (
    override &&
    treeContainsBuilderNodeId(builderTree, override) &&
    (sectionIdByBuilderNodeId.get(override) ?? null) === selectedSectionId
  ) {
    return override;
  }
  if (!selectedSectionId) return null;
  return builderNodeIdBySectionId.get(selectedSectionId) ?? null;
}

export function findBuilderNodeById(
  tree: BuilderNodeTree,
  nodeId: string | null,
): BuilderNode | null {
  if (!nodeId) return null;
  const queue = [...tree];
  while (queue.length > 0) {
    const current = queue.shift() ?? null;
    if (!current) continue;
    if (current.id === nodeId) return current;
    if ("children" in current && Array.isArray(current.children)) {
      queue.unshift(...current.children);
    }
  }
  return null;
}

export function resolveStandaloneBuilderNodeForContent(
  tree: BuilderNodeTree,
  selectedBuilderNodeId: string | null,
): Exclude<BuilderNode, { kind: "section" }> | null {
  if (!selectedBuilderNodeId) return null;
  if (resolveBuilderNodeRole(selectedBuilderNodeId)) return null;
  const node = findBuilderNodeById(tree, selectedBuilderNodeId);
  // `section` (legacy slot) carries no free-form props — skip it. A
  // `section_embed` (Tulala component) DOES carry an editable `config` (the
  // curated section payload, e.g. featured-talent's manual picks), so we now
  // surface it for content editing — its own registry editor opens in the dock.
  if (!node || node.kind === "section") {
    return null;
  }
  return node;
}

/**
 * D3 fix — the value to patch onto a required media `src` field
 * (image/video nodes) when `MediaField`'s Clear affordance fires.
 *
 * `MediaField.onChange` is called with `null` on Clear and a value
 * URL on pick/paste. The old guard at every one of these call sites was
 * `if (!next) return;`, which silently swallowed the `null` case — Clear
 * rendered (or, for the `row` variant, didn't even render) but never did
 * anything. `src` is REQUIRED in both `imagePropsSchema` and
 * `videoPropsSchema` (registry.ts) but not constrained to non-empty, so ""
 * is a valid, real "cleared" state — render.tsx's image case already
 * treats an empty/unresolved `src` as an empty slot rather than crashing.
 */
export function resolveClearableMediaSrc(next: string | null): string {
  return next ?? "";
}

/** Pure array-without-index helper — used by the social_feed item Clear
 * fix (mediaUrl is a REQUIRED https:// field per post, so clearing the
 * image removes the whole post) and mirrors the existing per-item
 * "Remove" button's own filter. */
export function removeItemAt<T>(items: ReadonlyArray<T>, index: number): T[] {
  return items.filter((_, i) => i !== index);
}
