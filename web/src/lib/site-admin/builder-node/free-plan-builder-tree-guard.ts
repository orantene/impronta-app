import type { BuilderNode } from "./types";
import type { BuilderNodeTree } from "./types";

/**
 * Collect ids of non-root section nodes (everything nested under sections).
 * Section nodes themselves use composition-driven identities and may appear/disappear
 * when operators add/remove sections from the library — those changes stay allowed on Free.
 */
export function collectDescendantNonSectionNodeIds(
  tree: BuilderNodeTree,
): Set<string> {
  const out = new Set<string>();

  function walk(node: BuilderNode): void {
    if (node.kind === "section") {
      if ("children" in node && Array.isArray(node.children)) {
        for (const c of node.children) walk(c);
      }
      return;
    }
    out.add(node.id);
    if ("children" in node && Array.isArray(node.children)) {
      for (const c of node.children) walk(c);
    }
  }

  for (const root of tree) {
    walk(root);
  }
  return out;
}

/**
 * Free workspaces cannot **insert / paste / duplicate** nested builder nodes (client:
 * `assertAdvancedLibraryAllowsOperation`). Defense in depth: reject saves where the draft
 * tree introduces **new** nested node ids vs the prior draft revision (move/remove/patch
 * keep ids stable).
 */
export function assertFreePlanAllowsNestedBuilderMutation(
  previousTree: BuilderNodeTree,
  nextTree: BuilderNodeTree,
): { ok: true } | { ok: false; message: string } {
  const prev = collectDescendantNonSectionNodeIds(previousTree);
  const next = collectDescendantNonSectionNodeIds(nextTree);
  for (const id of next) {
    if (!prev.has(id)) {
      return {
        ok: false,
        message:
          "Adding nested blocks requires a paid workspace plan. Upgrade for Advanced composition, or reload and use section templates.",
      };
    }
  }
  return { ok: true };
}

/**
 * Descendant non-section node ids grouped by CMS section id (`section.props.sectionId`).
 * Used to compare publish draft vs last published snapshot **per section** without blocking
 * newly inserted sections (new `sectionId`s).
 */
export function collectDescendantNonSectionIdsByCmsSectionId(
  tree: BuilderNodeTree,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();

  function add(sectionKey: string, id: string): void {
    let bucket = out.get(sectionKey);
    if (!bucket) {
      bucket = new Set();
      out.set(sectionKey, bucket);
    }
    bucket.add(id);
  }

  function walk(node: BuilderNode, cmsSectionKey: string | null): void {
    if (node.kind === "section") {
      const ownId =
        typeof node.props.sectionId === "string" ? node.props.sectionId.trim() : "";
      const sectionKey = ownId || cmsSectionKey;
      if ("children" in node && Array.isArray(node.children)) {
        for (const c of node.children) {
          walk(c, sectionKey || cmsSectionKey);
        }
      }
      return;
    }
    if (cmsSectionKey) {
      add(cmsSectionKey, node.id);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const c of node.children) {
        walk(c, cmsSectionKey);
      }
    }
  }

  for (const root of tree) {
    walk(root, null);
  }
  return out;
}

const MAX_PUBLISH_VIOLATION_MESSAGES = 4;

/**
 * Publish-time defense for Free: for each section that existed on the **last published**
 * homepage, draft nested node ids must be a subset of published nested ids (no new
 * library-added blocks under existing sections). New sections are unconstrained here.
 */
export function collectFreePlanPublishNestedViolations(
  publishedTree: BuilderNodeTree,
  draftTree: BuilderNodeTree,
  publishedSectionIds: ReadonlySet<string>,
): string[] {
  const pubMap = collectDescendantNonSectionIdsByCmsSectionId(publishedTree);
  const draftMap = collectDescendantNonSectionIdsByCmsSectionId(draftTree);
  const violations: string[] = [];

  for (const sectionId of publishedSectionIds) {
    if (violations.length >= MAX_PUBLISH_VIOLATION_MESSAGES) break;
    const draftIds = draftMap.get(sectionId);
    if (!draftIds || draftIds.size === 0) continue;
    const pubIds = pubMap.get(sectionId) ?? new Set<string>();
    let foundNew = false;
    for (const id of draftIds) {
      if (!pubIds.has(id)) {
        foundNew = true;
        break;
      }
    }
    if (foundNew) {
      violations.push(
        `Free workspace: nested blocks under section ${sectionId.slice(0, 8)}… exceed what was published last time. Remove library-added blocks or upgrade before publishing.`,
      );
    }
  }
  return violations;
}
