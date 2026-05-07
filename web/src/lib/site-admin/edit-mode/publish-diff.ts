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
