/**
 * Free personal website — the STRUCTURAL edit guard (pure).
 *
 * Modelled on `lib/site-admin/builder-node/free-plan-builder-tree-guard.ts`,
 * which does the same job for free WORKSPACES. The rule here:
 *
 *   without `personalSiteSections`, a draft save may not introduce a NEW node
 *   id nested under a section.
 *
 * What that allows, which is the whole of the free editing story:
 *   - prop patches (text, images, logo, links) — ids are stable;
 *   - hidden / visibility toggles — ids are stable;
 *   - reorders — ids move, ids do not change;
 *   - removals — ids disappear, and a shrinking set can never introduce one.
 *
 * What it refuses: inserting, pasting or duplicating a block (a new id appears
 * under a section) and adding a whole new section (its children are new ids
 * under a section). Both are Web Office.
 *
 * Section nodes' OWN ids are not collected, mirroring the workspace guard:
 * composition-driven section identities may legitimately churn when a Design is
 * applied, and a Design apply rewrites the trees server-side rather than coming
 * through this chokepoint at all.
 *
 * PURE — no IO, no runtime imports beyond the node types, so it unit-tests with
 * plain object literals and can sit on any save path.
 */

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

export type FreeSiteTreeGuardResult =
  | { ok: true }
  | { ok: false; code: "sections_locked"; message: string };

/** Degrade-safe coercion: anything that is not an array is an empty tree. */
function asTree(value: unknown): BuilderNodeTree {
  return Array.isArray(value) ? (value as BuilderNodeTree) : [];
}

function childrenOf(node: BuilderNode): readonly BuilderNode[] {
  const kids = (node as { children?: unknown }).children;
  return Array.isArray(kids) ? (kids as BuilderNode[]) : [];
}

/**
 * Ids of every non-section node that sits UNDER a section, at any depth.
 *
 * Root-level non-section nodes are deliberately excluded: the talent home tree
 * is a list of sections, so anything a talent can insert lands under one, and
 * excluding the roots keeps a shell that is not section-wrapped (a legacy
 * hand-built tree) from being frozen solid.
 */
export function collectTalentSiteSectionChildIds(tree: unknown): Set<string> {
  const out = new Set<string>();

  const walk = (node: BuilderNode, insideSection: boolean): void => {
    const isSection = node.kind === "section";
    if (!isSection && insideSection && typeof node.id === "string" && node.id) {
      out.add(node.id);
    }
    for (const child of childrenOf(node)) {
      walk(child, insideSection || isSection);
    }
  };

  for (const root of asTree(tree)) walk(root, false);
  return out;
}

/** The refusal copy, en + es. Named for the one paid tier: Web Office. */
const SECTIONS_LOCKED = {
  en: "Adding sections and blocks is part of Web Office. Your free website can edit, hide and reorder everything it already has.",
  es: "Añadir secciones y bloques es parte de Web Office. Tu sitio gratuito puede editar, ocultar y reordenar todo lo que ya tiene.",
} as const;

export function freeSiteSectionsLockedMessage(locale?: string | null): string {
  return locale === "es" ? SECTIONS_LOCKED.es : SECTIONS_LOCKED.en;
}

/**
 * Compare a draft save against the tree currently stored and refuse when it
 * introduces a new nested node id.
 *
 * `canInsertSections` is the caller's `personalSiteSections` capability: true
 * short-circuits to `{ ok: true }`, so a Web Office talent (and every talent
 * while `TALENT_FREE_WEBSITE_ENABLED` is off, since the capability resolves
 * Max-only then) never pays for this walk.
 */
export function assertFreeTalentSiteTreeMutation(input: {
  previousTree: unknown;
  nextTree: unknown;
  canInsertSections: boolean;
  locale?: string | null;
}): FreeSiteTreeGuardResult {
  if (input.canInsertSections) return { ok: true };

  const previous = collectTalentSiteSectionChildIds(input.previousTree);
  const next = collectTalentSiteSectionChildIds(input.nextTree);
  for (const id of next) {
    if (!previous.has(id)) {
      return {
        ok: false,
        code: "sections_locked",
        message: freeSiteSectionsLockedMessage(input.locale),
      };
    }
  }
  return { ok: true };
}
