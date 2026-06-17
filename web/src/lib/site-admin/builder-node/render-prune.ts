/**
 * HYGIENE-1 (Q5) — Shared render-time empty-section guard.
 *
 * Provides `isRenderableEmptySection(node, dataSources)`: a pure predicate that
 * returns true when a top-level container node is a data-bound repeater whose
 * resolved collection is empty AND has no manual fallback children that would
 * render something meaningful. When true, `renderBuilderNodes` omits the node
 * entirely so an empty "Selected work" or "Services" section never renders over
 * nothing.
 *
 * INVARIANT: this guard must be CONSERVATIVE.
 * - Only prune when the node is a repeater (binding.repeat === true).
 * - Only prune when the resolved collection resolves to zero items.
 * - Only prune when there are no children that could fall back to static content
 *   (i.e. no children, or all children are themselves repeat-only with empty
 *   text props).
 * - Never prune nodes that have manual child content (images, non-empty
 *   headings/paragraphs, buttons).
 * - A section whose data source is not present in dataSources (returns []) but
 *   DOES have manual children is NOT pruned — authors who manually authored
 *   content inside a bound container keep it visible.
 *
 * This subsumes and generalises the per-talent `pruneEmptyServiceCards` /
 * `pruneEmptyMaxBadge` token-time prune in default-talent-tree.ts, which
 * operates at hydration time on static token-substituted trees. This guard
 * operates at RENDER time on dynamically bound trees. Both can coexist:
 * token-time prune runs first (hydrateTalentTree), then this render-time guard
 * runs on the resulting tree — belt-and-suspenders.
 *
 * Pure — no React, no server imports. Safe to unit-test.
 */

import type { BuilderNode } from "./types";
import type { BuilderNodeRenderDataSources } from "./render";
import {
  getBuilderNodeDataBinding,
  isBuilderDataBindingRepeater,
  resolveBuilderDataBindingCollection,
} from "./data-bindings";

/**
 * Resolve the collection records for a given data-source key from the render
 * dataSources. Returns [] when the source is absent or unrecognised — the same
 * semantics as `collectionRecordsForSource` in render.tsx.
 *
 * NOTE: This is a PURE read of the dataSources snapshot. It does NOT call the
 * live `collectionRecordsForSource` (which imports FeaturedTalentCard DTOs and
 * depends on render.tsx internals). We only need to know whether the collection
 * is empty — not its shape — so checking the canonical key in collections + the
 * well-known aliases is sufficient.
 */
function resolvedCollectionIsEmpty(
  sourceKey: string,
  dataSources: BuilderNodeRenderDataSources,
): boolean {
  // 1. Custom collections (the most common source for data-bound repeaters).
  if (dataSources.collections) {
    const custom = dataSources.collections[sourceKey];
    if (custom !== undefined) return custom.length === 0;
  }

  // 2. Well-known built-in sources.
  switch (sourceKey) {
    case "featured_talent_profiles":
      return (dataSources.featuredTalentProfiles ?? []).length === 0;
    case "talent_locations":
      return (dataSources.talentLocations ?? []).length === 0;
    case "tenant_directory_search":
      return (dataSources.directoryShortcuts ?? []).length === 0;
    case "workspace_social_links":
      return (dataSources.socialLinks ?? []).length === 0;
    case "cms_page":
    case "cms_posts":
      // These are always injected via dataSources.collections when present; if
      // not in collections the caller did not supply data, so effectively empty.
      return true;
    default:
      // Unknown source — treat as not-yet-loaded (NOT empty). We refuse to prune
      // a node whose source we cannot inspect, because a missing key may mean
      // the caller simply did not inject it yet (future source type). This is the
      // safe/conservative fallback.
      return false;
  }
}

/**
 * Returns true when ANY descendant node carries non-empty static content
 * (a heading/paragraph with a non-empty text prop, an image with a src, or a
 * button with a label/href). If such content exists the section keeps its
 * manual authored fallback and MUST NOT be pruned.
 */
function hasStaticContent(node: BuilderNode): boolean {
  if (node.kind === "heading" || node.kind === "paragraph") {
    const text = (node.props as { text?: unknown }).text;
    if (typeof text === "string" && text.trim() !== "") return true;
  }
  if (node.kind === "image") {
    const src = (node.props as { src?: unknown }).src;
    if (typeof src === "string" && src.trim() !== "") return true;
  }
  if (node.kind === "button") {
    const label = (node.props as { label?: unknown }).label;
    const href = (node.props as { href?: unknown }).href;
    if (
      (typeof label === "string" && label.trim() !== "") ||
      (typeof href === "string" && href.trim() !== "")
    ) {
      return true;
    }
  }
  if ("children" in node && Array.isArray(node.children)) {
    if (node.children.some(hasStaticContent)) return true;
  }
  return false;
}

/**
 * HYGIENE-1 Q5 — Public prune predicate.
 *
 * Returns `true` when the node should be OMITTED from SSR output:
 * - The node is a container with a data-bound repeater binding.
 * - The resolved collection is empty (no items to repeat over).
 * - No descendant carries static manual content that would render something
 *   meaningful in the fallback (single-template) path.
 *
 * Returns `false` (do NOT prune) in all other cases, including:
 * - Non-container nodes.
 * - Containers without a repeater binding.
 * - Containers whose collection is non-empty.
 * - Containers that have static fallback content.
 * - Containers whose source key is unrecognised (conservative: don't prune).
 */
export function isRenderableEmptySection(
  node: BuilderNode,
  dataSources: BuilderNodeRenderDataSources,
): boolean {
  // Only applies to containers.
  if (node.kind !== "container") return false;

  // Must have a repeater binding.
  const binding = getBuilderNodeDataBinding(node);
  if (!isBuilderDataBindingRepeater(binding)) return false;

  // Resolve the collection — if non-empty the section has data and must render.
  const records = resolvedCollectionIsEmpty(binding!.sourceKey, dataSources);
  if (!records) return false; // collection is non-empty → do not prune

  // Empty collection confirmed. Now check: does the node have manual fallback
  // children that carry real static content?
  if ("children" in node && Array.isArray(node.children)) {
    if (node.children.some(hasStaticContent)) return false; // has manual content → keep
  }

  // Empty collection + no static fallback → prune.
  return true;
}

/**
 * Resolve the collection for a repeater node using the same dataSources that
 * `renderBuilderNodes` receives. Returns the collection items (may be empty).
 * Used by tests to assert the prune predicate is consistent with the renderer.
 *
 * @internal — exported for testing only.
 */
export function resolveRepeatCollection(
  node: BuilderNode,
  dataSources: BuilderNodeRenderDataSources,
): ReadonlyArray<unknown> {
  if (node.kind !== "container") return [];
  const binding = getBuilderNodeDataBinding(node);
  if (!isBuilderDataBindingRepeater(binding)) return [];

  // Use the same resolution path as the renderer.
  const sourceKey = binding!.sourceKey;
  if (dataSources.collections?.[sourceKey] !== undefined) {
    return dataSources.collections[sourceKey]!;
  }
  switch (sourceKey) {
    case "featured_talent_profiles":
      return dataSources.featuredTalentProfiles ?? [];
    case "talent_locations":
      return dataSources.talentLocations ?? [];
    case "tenant_directory_search":
      return dataSources.directoryShortcuts ?? [];
    case "workspace_social_links":
      return dataSources.socialLinks ?? [];
    default:
      return [];
  }
}

/**
 * Convenience: returns the resolved collection items for a repeater binding,
 * applying maxItems if set. Mirrors the logic in `resolveBuilderDataBindingCollection`.
 *
 * @internal — exported for testing.
 */
export function resolveRepeatCollectionWithBinding(
  node: BuilderNode,
  dataSources: BuilderNodeRenderDataSources,
): ReturnType<typeof resolveBuilderDataBindingCollection> {
  if (node.kind !== "container") return [];
  const binding = getBuilderNodeDataBinding(node);
  if (!isBuilderDataBindingRepeater(binding)) return [];
  const rawRecords = resolveRepeatCollection(node, dataSources);
  return resolveBuilderDataBindingCollection(
    binding,
    rawRecords as ReadonlyArray<Record<string, unknown>>,
  );
}
