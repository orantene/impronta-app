export interface MultiNodeSelectionState {
  primaryId: string | null;
  additionalIds: ReadonlySet<string>;
}

export function selectedIdsFromState(
  primaryId: string | null,
  additionalIds: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  if (primaryId) out.push(primaryId);
  for (const id of additionalIds) {
    if (id !== primaryId && !out.includes(id)) out.push(id);
  }
  return out;
}

export function replaceSelection(ids: ReadonlyArray<string>): MultiNodeSelectionState {
  const unique = ids.filter((id, index) => id && ids.indexOf(id) === index);
  return {
    primaryId: unique[0] ?? null,
    additionalIds: new Set(unique.slice(1)),
  };
}

export function extendSelection(
  state: MultiNodeSelectionState,
  id: string,
): MultiNodeSelectionState {
  if (!state.primaryId) {
    return { primaryId: id, additionalIds: new Set() };
  }
  if (state.primaryId === id || state.additionalIds.has(id)) return state;
  const next = new Set(state.additionalIds);
  next.add(id);
  return { primaryId: state.primaryId, additionalIds: next };
}

export function toggleSelection(
  state: MultiNodeSelectionState,
  id: string,
): MultiNodeSelectionState {
  if (!state.primaryId) {
    return { primaryId: id, additionalIds: new Set() };
  }
  if (state.primaryId === id) {
    const rest = Array.from(state.additionalIds);
    return replaceSelection(rest);
  }
  const next = new Set(state.additionalIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return { primaryId: state.primaryId, additionalIds: next };
}

export function removeMissingSelectionIds(
  state: MultiNodeSelectionState,
  exists: (id: string) => boolean,
): MultiNodeSelectionState {
  return replaceSelection(
    selectedIdsFromState(state.primaryId, state.additionalIds).filter(exists),
  );
}
