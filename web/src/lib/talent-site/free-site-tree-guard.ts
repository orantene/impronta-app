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
 * under a section, or an existing id appears MORE times than before) and
 * adding a whole new section (the section count grows, even for an empty one).
 * Both are Web Office.
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
 * How many times each non-section node id occurs UNDER a section, at any
 * depth, plus how many section nodes the tree holds.
 *
 * Root-level non-section nodes are deliberately excluded: the talent home tree
 * is a list of sections, so anything a talent can insert lands under one, and
 * excluding the roots keeps a shell that is not section-wrapped (a legacy
 * hand-built tree) from being frozen solid.
 *
 * COUNTS, not a set: a forged save can duplicate a whole section subtree while
 * REUSING every id in it. A set comparison sees no new id and waves it
 * through; a count comparison sees the same id twice where it was there once.
 *
 * SECTIONS, counted but not identified: section ids are deliberately not
 * collected (composition-driven section identities churn when a Design is
 * applied), but the NUMBER of sections still may not grow through this
 * chokepoint, which is what stops an empty new section being appended.
 */
export interface TalentSiteTreeShape {
  /** id -> how many times it appears nested under a section. */
  readonly childCounts: ReadonlyMap<string, number>;
  /** How many `kind === "section"` nodes the tree holds, at any depth. */
  readonly sectionCount: number;
}

export function collectTalentSiteTreeShape(tree: unknown): TalentSiteTreeShape {
  const childCounts = new Map<string, number>();
  let sectionCount = 0;

  const walk = (node: BuilderNode, insideSection: boolean): void => {
    const isSection = node.kind === "section";
    if (isSection) sectionCount += 1;
    if (!isSection && insideSection && typeof node.id === "string" && node.id) {
      childCounts.set(node.id, (childCounts.get(node.id) ?? 0) + 1);
    }
    for (const child of childrenOf(node)) {
      walk(child, insideSection || isSection);
    }
  };

  for (const root of asTree(tree)) walk(root, false);
  return { childCounts, sectionCount };
}

/**
 * Ids of every non-section node that sits under a section. Kept as the
 * readable view of {@link collectTalentSiteTreeShape} for callers and tests
 * that only care about identity, never about multiplicity.
 */
export function collectTalentSiteSectionChildIds(tree: unknown): Set<string> {
  return new Set(collectTalentSiteTreeShape(tree).childCounts.keys());
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

  const previous = collectTalentSiteTreeShape(input.previousTree);
  const next = collectTalentSiteTreeShape(input.nextTree);

  const refuse = (): FreeSiteTreeGuardResult => ({
    ok: false,
    code: "sections_locked",
    message: freeSiteSectionsLockedMessage(input.locale),
  });

  // A new nested id, or an existing id that now appears MORE often than it
  // did (a subtree duplicated with its ids reused, which a set comparison
  // cannot see).
  for (const [id, count] of next.childCounts) {
    if (count > (previous.childCounts.get(id) ?? 0)) return refuse();
  }
  // More sections than before: appending an EMPTY section adds no nested id at
  // all, so the count is the only thing that catches it. Reorders and removals
  // never raise this number.
  if (next.sectionCount > previous.sectionCount) return refuse();

  return { ok: true };
}
