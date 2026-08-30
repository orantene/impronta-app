/**
 * Seed-time structural prune for the platform-default storefront.
 *
 * Copy substitution cannot hide a section: `visibilityCondition` is
 * locale/auth/variant only, and the placeholder walk treats it as opaque.
 * The legacy slot seed already asks `starterAudienceHasRoster` and omits
 * `featured_talent` for a business workspace. This is the same predicate
 * on the freeform Lab tree so both seed paths stay honest.
 *
 * Render-time fallback has no audience (the signup answer is not on the
 * tenant row). An absent audience leaves the authored tree intact.
 */

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import {
  starterAudienceHasRoster,
  type StarterAudience,
} from "./onboard-starter-content-entries";

const FEATURED_TALENT_SECTION = "featured_talent";
const FEATURED_TALENT_LAYER = "Featured Talent Section";

function isFeaturedTalentEmbed(node: BuilderNode): boolean {
  return (
    node.kind === "section_embed" &&
    node.props.sectionTypeKey === FEATURED_TALENT_SECTION
  );
}

function isFeaturedTalentDecomposedRoot(node: BuilderNode): boolean {
  return (
    node.kind === "container" &&
    node.props.layerLabel === FEATURED_TALENT_LAYER
  );
}

function pruneNode(node: BuilderNode): BuilderNode | null {
  if (isFeaturedTalentEmbed(node) || isFeaturedTalentDecomposedRoot(node)) {
    return null;
  }
  const children = node.children;
  if (!children || children.length === 0) return node;
  let changed = false;
  const next: BuilderNode[] = [];
  for (const child of children) {
    const kept = pruneNode(child);
    if (kept === null) {
      changed = true;
      continue;
    }
    if (kept !== child) changed = true;
    next.push(kept);
  }
  if (!changed) return node;
  return { ...node, children: next };
}

/**
 * Drop featured-talent showcase nodes when this audience does not run a roster.
 * Copy-on-write: unchanged trees come back by reference.
 */
export function pruneStarterRosterForAudience(
  tree: BuilderNodeTree,
  audience: string | null | undefined,
): BuilderNodeTree {
  if (!Array.isArray(tree) || tree.length === 0) return tree;
  if (audience == null || audience === "") return tree;
  if (starterAudienceHasRoster(audience as StarterAudience)) return tree;

  let changed = false;
  const next: BuilderNode[] = [];
  for (const node of tree) {
    const kept = pruneNode(node);
    if (kept === null) {
      changed = true;
      continue;
    }
    if (kept !== node) changed = true;
    next.push(kept);
  }
  return changed ? next : tree;
}
