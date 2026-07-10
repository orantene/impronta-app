export interface PublishDiffRow {
  sectionId: string;
  slotKey: string;
  sortOrder: number;
}

export type SectionChangeKind = "added" | "moved" | "unchanged";

export interface PublishDiffSummary {
  added: number;
  removed: number;
  moved: number;
  total: number;
}

export interface PublishDiffResult {
  summary: PublishDiffSummary;
  draftSectionChanges: ReadonlyMap<string, SectionChangeKind>;
  removedSectionIds: ReadonlyArray<string>;
}

export function diffPublishedRows(
  draftRows: ReadonlyArray<PublishDiffRow>,
  liveRows: ReadonlyArray<PublishDiffRow>,
): PublishDiffResult {
  const draftById = new Map(
    draftRows.map((row) => [row.sectionId, row] as const),
  );
  const liveById = new Map(
    liveRows.map((row) => [row.sectionId, row] as const),
  );
  const changes = new Map<string, SectionChangeKind>();

  let added = 0;
  let removed = 0;
  let moved = 0;
  const removedSectionIds: string[] = [];

  for (const [sectionId, draft] of draftById) {
    const live = liveById.get(sectionId);
    if (!live) {
      added += 1;
      changes.set(sectionId, "added");
      continue;
    }
    if (live.slotKey !== draft.slotKey || live.sortOrder !== draft.sortOrder) {
      moved += 1;
      changes.set(sectionId, "moved");
      continue;
    }
    changes.set(sectionId, "unchanged");
  }

  for (const sectionId of liveById.keys()) {
    if (!draftById.has(sectionId)) {
      removed += 1;
      removedSectionIds.push(sectionId);
    }
  }

  return {
    summary: {
      added,
      removed,
      moved,
      total: added + removed + moved,
    },
    draftSectionChanges: changes,
    removedSectionIds,
  };
}

// ── W1-L2 — builder-tree (freeform) publish diff ────────────────────────────
//
// Freeform pages keep ALL content in the builder tree; their curated slot
// rows are empty, so `diffPublishedRows` always reports zero and the publish
// drawer used to claim "0 changes since last publish" for a page with real
// edits. This diff compares the DRAFT tree against the tree baked into the
// published snapshot at TOP-LEVEL-node granularity (a top-level node is one
// "section" layer in the page structure panel):
//
//   added   — draft top-level node id not present in the published tree
//   removed — published top-level node id no longer in the draft
//   moved   — same id at a different top-level index
//   changed — same id, same position, but the serialized subtree differs
//             (counted into `moved` in the shared summary shape so the
//             existing "+A added · M moved · -R removed" chip stays valid;
//             see `changed` for the standalone count)
//
// Node ids are stable across edits (the builder ops are copy-on-write over
// persisted ids), so identity by id is sound.

/** Minimal structural shape of a builder node for diff purposes. */
interface DiffableNode {
  id?: unknown;
}

export interface BuilderTreePublishDiff {
  summary: PublishDiffSummary;
  /** Same-id same-position nodes whose subtree content differs. */
  changed: number;
}

function nodeKey(node: unknown, index: number): string {
  const id = (node as DiffableNode)?.id;
  return typeof id === "string" && id.length > 0 ? id : `__index_${index}`;
}

export function diffBuilderTreesForPublish(
  draftTree: ReadonlyArray<unknown>,
  publishedTree: ReadonlyArray<unknown>,
): BuilderTreePublishDiff {
  const draftById = new Map<string, { node: unknown; index: number }>();
  draftTree.forEach((node, index) => {
    draftById.set(nodeKey(node, index), { node, index });
  });
  const publishedById = new Map<string, { node: unknown; index: number }>();
  publishedTree.forEach((node, index) => {
    publishedById.set(nodeKey(node, index), { node, index });
  });

  let added = 0;
  let removed = 0;
  let moved = 0;
  let changed = 0;

  for (const [id, draft] of draftById) {
    const live = publishedById.get(id);
    if (!live) {
      added += 1;
      continue;
    }
    if (live.index !== draft.index) {
      moved += 1;
      continue;
    }
    // Same id, same position — content change iff the serialized subtree
    // differs. JSON.stringify is acceptable here: trees are plain JSON and
    // this runs once per drawer-open, not per keystroke.
    if (JSON.stringify(draft.node) !== JSON.stringify(live.node)) {
      changed += 1;
    }
  }
  for (const id of publishedById.keys()) {
    if (!draftById.has(id)) removed += 1;
  }

  return {
    summary: {
      added,
      removed,
      // The shared summary shape has no `changed` bucket; fold content-only
      // changes into `moved` so `total` is an honest "how many top-level
      // sections differ" count for the stat line.
      moved: moved + changed,
      total: added + removed + moved + changed,
    },
    changed,
  };
}

/**
 * W1-L2 — the publish drawer's "N sections ready" count.
 *
 * Curated pages count their slot rows. FREEFORM pages keep all content as
 * top-level builder-tree layers and have ZERO slot rows, so the old
 * slots-only count showed "0 sections ready" on a fully-built page (audit
 * defect 3). When the slot count is 0, fall back to the top-level tree layer
 * count (the same unit the Page structure panel lists at level 1).
 */
export function effectiveSectionsReadyCount(
  slotSectionCount: number,
  treeTopLevelCount: number,
): number {
  return slotSectionCount > 0 ? slotSectionCount : treeTopLevelCount;
}
