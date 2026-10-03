/**
 * Free personal website — the STRUCTURAL edit guard (pure).
 *
 * Modelled on `lib/site-admin/builder-node/free-plan-builder-tree-guard.ts`,
 * which does the same job for free WORKSPACES. The rule here:
 *
 *   without `personalSiteSections`, a draft save may not change the structural
 *   shape of the tree relative to what is already stored (the published /
 *   baseline tree the save path passes as `previousTree`).
 *
 * What that allows, which is the whole of the free editing story:
 *   - prop patches (text, images, logo, links) — ids and order stay stable;
 *   - hidden / visibility toggles — ids and order stay stable;
 *   - removals — ids disappear, and a shrinking set can never introduce one
 *     or reorder what remains.
 *
 * What it refuses: inserting, pasting or duplicating a block; adding a section;
 * reordering blocks or sections (same ids, different order). Those are Web Office.
 *
 * Section nodes' OWN ids ARE included in the order fingerprint (so section
 * reorders are visible), but composition-driven Design applies rewrite trees
 * server-side rather than coming through this chokepoint at all.
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
 * depth, plus how many section nodes the tree holds, plus the document-order
 * fingerprint of every structural id (sections + nested children).
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
 * ORDER: the sequence of section ids and nested child ids in document order.
 * A reorder keeps every count identical; only the sequence changes. Removals
 * keep relative order of what remains (a subsequence), so they still pass.
 */
export interface TalentSiteTreeShape {
  /** id -> how many times it appears nested under a section. */
  readonly childCounts: ReadonlyMap<string, number>;
  /** How many `kind === "section"` nodes the tree holds, at any depth. */
  readonly sectionCount: number;
  /**
   * Document-order fingerprint: every section id, then every nested
   * non-section id under sections, depth-first.
   */
  readonly structuralOrder: readonly string[];
}

export function collectTalentSiteTreeShape(tree: unknown): TalentSiteTreeShape {
  const childCounts = new Map<string, number>();
  let sectionCount = 0;
  const structuralOrder: string[] = [];

  const walk = (node: BuilderNode, insideSection: boolean): void => {
    const isSection = node.kind === "section";
    if (isSection) {
      sectionCount += 1;
      if (typeof node.id === "string" && node.id) structuralOrder.push(node.id);
    }
    if (!isSection && insideSection && typeof node.id === "string" && node.id) {
      childCounts.set(node.id, (childCounts.get(node.id) ?? 0) + 1);
      structuralOrder.push(node.id);
    }
    for (const child of childrenOf(node)) {
      walk(child, insideSection || isSection);
    }
  };

  for (const root of asTree(tree)) walk(root, false);
  return { childCounts, sectionCount, structuralOrder };
}

/**
 * Ids of every non-section node that sits under a section. Kept as the
 * readable view of {@link collectTalentSiteTreeShape} for callers and tests
 * that only care about identity, never about multiplicity.
 */
export function collectTalentSiteSectionChildIds(tree: unknown): Set<string> {
  return new Set(collectTalentSiteTreeShape(tree).childCounts.keys());
}

/**
 * True when `next` is a subsequence of `previous` (same relative order; ids
 * may be dropped). Used so Free removals stay allowed while reorders refuse.
 */
export function isStructuralOrderPreserved(
  previous: readonly string[],
  next: readonly string[],
): boolean {
  let i = 0;
  for (const id of next) {
    while (i < previous.length && previous[i] !== id) i += 1;
    if (i >= previous.length) return false;
    i += 1;
  }
  return true;
}

/** The refusal copy, en + es. Named for the one paid tier: Web Office. */
const SECTIONS_LOCKED = {
  en: "Available on Web Office. Your free website can edit and hide what it already has.",
  es: "Disponible en Oficina Web. Tu sitio gratuito puede editar y ocultar lo que ya tiene.",
} as const;

export function freeSiteSectionsLockedMessage(locale?: string | null): string {
  return locale === "es" ? SECTIONS_LOCKED.es : SECTIONS_LOCKED.en;
}

/**
 * Compare a draft save against the tree currently stored (the published /
 * baseline body the save path passes) and refuse when it introduces a new
 * nested node id, grows counts, or reorders blocks.
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

  // Same ids, different order (or a forged payload that resequences while
  // dropping nothing). Removals keep a subsequence of the previous order.
  if (!isStructuralOrderPreserved(previous.structuralOrder, next.structuralOrder)) {
    return refuse();
  }

  return { ok: true };
}
