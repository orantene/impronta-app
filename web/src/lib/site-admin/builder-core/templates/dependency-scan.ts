/**
 * dependency-scan.ts — G5 pure dependency scanner.
 *
 * Before archiving / hiding a catalog component, a pre-write scan walks every
 * PUBLISHED `builder_templates` tree to find templates that DEPEND on that
 * component, so the operator is blocked (or shown an "archive anyway — N
 * templates depend on this" confirm that lists the dependents).
 *
 * The recursive visitor mirrors `computeDataBindingRequirements` /
 * `collectDanglingBindings` (depth-first pre-order over `node.children`). The
 * match key is the node IDENTITY a published tree can carry for a catalog
 * component:
 *
 *   - `section_embed` nodes carry `props.sectionTypeKey` (a curated-section /
 *     "Tulala component" key). This is the recoverable dependency vector: when
 *     a template embeds a curated section, archiving/hiding that section's
 *     catalog item would brick the template's "+"-inserted section.
 *
 *   - `node.kind` (the BuilderNodeKind) is matched too, so a component keyed on
 *     a native node kind can be scanned the same way (kept general; the visitor
 *     keys on the discriminant exactly like the binding visitors).
 *
 * NOTE on db-template (page-template) components: a `dbTemplate` gallery item is
 * INLINED into the host tree with freshly-minted ids at insert time
 * (`createDbTemplateNodeForGalleryItem`), leaving NO back-reference. There is
 * therefore nothing to scan for in the host tree — an embedded page template is
 * a one-time copy, not a live dependency — so this scanner intentionally does
 * not (and cannot) match those. The dependency it CAN protect is the curated
 * `section_embed`.
 *
 * Pure: no I/O, no DB, no throwing. The server action loads the published rows
 * and feeds them in; the UI renders the returned dependent list in a confirm.
 */

import type { BuilderNode, BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * The identity of the catalog component being archived/hidden, expressed in the
 * forms a published template tree can reference. A scan matches a node when its
 * `section_embed` `sectionTypeKey` is in `sectionEmbedKeys`, OR its `kind` is in
 * `builderNodeKinds`. At least one set should be non-empty; an all-empty spec
 * matches nothing (an unreferenced archive is then unaffected).
 */
export interface ComponentDependencyTarget {
  /** `section_embed.props.sectionTypeKey` values that identify this component. */
  sectionEmbedKeys?: ReadonlyArray<string>;
  /** BuilderNode kinds that identify this component (native-element components). */
  builderNodeKinds?: ReadonlyArray<BuilderNodeKind>;
}

/** A minimal published-template shape the scan walks. */
export interface ScannableTemplate {
  id: string;
  title: string;
  slug: string;
  builder_tree: ReadonlyArray<BuilderNode>;
}

/** One dependent template + WHY it matched (for the confirm copy). */
export interface ComponentDependent {
  id: string;
  title: string;
  slug: string;
  /** Number of matching nodes found in this template's tree (≥ 1). */
  matchCount: number;
}

// ── Node-identity match ───────────────────────────────────────────────────────

/** Read `props.sectionTypeKey` off a `section_embed` node (else null). */
function sectionEmbedKeyOf(node: BuilderNode): string | null {
  if (node.kind !== "section_embed") return null;
  const props = (node as { props?: { sectionTypeKey?: unknown } }).props;
  const key = props?.sectionTypeKey;
  return typeof key === "string" && key.length > 0 ? key : null;
}

/** Does this single node reference the target component? */
function nodeMatchesTarget(
  node: BuilderNode,
  target: ComponentDependencyTarget,
): boolean {
  const embedKeys = target.sectionEmbedKeys;
  if (embedKeys && embedKeys.length > 0) {
    const embedKey = sectionEmbedKeyOf(node);
    if (embedKey !== null && embedKeys.includes(embedKey)) return true;
  }
  const kinds = target.builderNodeKinds;
  if (kinds && kinds.length > 0 && kinds.includes(node.kind)) return true;
  return false;
}

// ── Tree walk (depth-first pre-order, mirrors the binding visitors) ───────────

/** Count matching nodes in one tree. Recurses `node.children` like the binding visitors. */
function countMatchesInTree(
  tree: ReadonlyArray<BuilderNode>,
  target: ComponentDependencyTarget,
): number {
  let count = 0;

  const visit = (node: BuilderNode): void => {
    if (nodeMatchesTarget(node, target)) count += 1;
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) {
      for (const child of children) visit(child);
    }
  };

  for (const node of tree) visit(node);
  return count;
}

/** True when `target` carries at least one identity to match against. */
export function isEmptyDependencyTarget(target: ComponentDependencyTarget): boolean {
  return (
    (target.sectionEmbedKeys?.length ?? 0) === 0 &&
    (target.builderNodeKinds?.length ?? 0) === 0
  );
}

/**
 * Scan a set of published templates for those that depend on the target
 * component. Returns one entry per dependent template (with a `matchCount`),
 * sorted by title for stable confirm copy. An empty target — or no matches —
 * returns `[]`, so an unreferenced archive is unaffected.
 */
export function scanTemplatesForComponentDependents(
  templates: ReadonlyArray<ScannableTemplate>,
  target: ComponentDependencyTarget,
): ComponentDependent[] {
  if (isEmptyDependencyTarget(target)) return [];

  const dependents: ComponentDependent[] = [];
  for (const tpl of templates) {
    const matchCount = countMatchesInTree(tpl.builder_tree ?? [], target);
    if (matchCount > 0) {
      dependents.push({
        id: tpl.id,
        title: tpl.title,
        slug: tpl.slug,
        matchCount,
      });
    }
  }

  dependents.sort((a, b) => a.title.localeCompare(b.title));
  return dependents;
}
