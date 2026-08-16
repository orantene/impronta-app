/**
 * selection.ts — the media library's selection model, as pure functions.
 *
 * Small on purpose. It lives outside the components because "what does
 * clicking a tile do" is the one behaviour every picker call site depends on
 * and the one that is invisible in a screenshot — so it is the part that
 * should be unit-tested rather than eyeballed.
 *
 * Three modes:
 *   none   — tiles are inert; activating one is a no-op.
 *   single — activating picks that asset and closes. Selection is never held.
 *   multi  — activating toggles the asset in a pending set, which the host
 *            commits on "Add".
 */

export type MediaSelectionMode = "none" | "single" | "multi";

export type MediaSelectionState = {
  /** Asset ids in the pending set (multi only). */
  ids: ReadonlyArray<string>;
  /** Public URLs in the pending set, in the order they were added. */
  urls: ReadonlyArray<string>;
};

export const EMPTY_SELECTION: MediaSelectionState = { ids: [], urls: [] };

export type MediaSelectionOutcome =
  | { kind: "noop" }
  /** Commit this asset immediately and close. */
  | { kind: "commit"; id: string; url: string }
  /** Replace the pending set. */
  | { kind: "pending"; state: MediaSelectionState };

export function activateSelection(
  mode: MediaSelectionMode,
  state: MediaSelectionState,
  asset: { id: string; publicUrl: string },
): MediaSelectionOutcome {
  if (mode === "none") return { kind: "noop" };
  if (mode === "single") {
    return { kind: "commit", id: asset.id, url: asset.publicUrl };
  }
  return { kind: "pending", state: toggleSelection(state, asset) };
}

/**
 * Toggle by ID, not by URL. Two library rows can resolve to the same public
 * URL (a derivative that was never re-uploaded, a re-registered object), and
 * a URL-keyed toggle would deselect the wrong tile — while the ID is the
 * primary key by construction. The URL list is kept in the order the operator
 * added them, because that is the order they will appear in a gallery.
 */
export function toggleSelection(
  state: MediaSelectionState,
  asset: { id: string; publicUrl: string },
): MediaSelectionState {
  const index = state.ids.indexOf(asset.id);
  if (index === -1) {
    return { ids: [...state.ids, asset.id], urls: [...state.urls, asset.publicUrl] };
  }
  return {
    ids: state.ids.filter((_, i) => i !== index),
    urls: state.urls.filter((_, i) => i !== index),
  };
}

/** Add an asset without toggling — used when an upload lands mid-session. */
export function addToSelection(
  state: MediaSelectionState,
  asset: { id: string; publicUrl: string },
): MediaSelectionState {
  if (state.ids.includes(asset.id)) return state;
  return { ids: [...state.ids, asset.id], urls: [...state.urls, asset.publicUrl] };
}

export function isSelected(state: MediaSelectionState, id: string): boolean {
  return state.ids.includes(id);
}
