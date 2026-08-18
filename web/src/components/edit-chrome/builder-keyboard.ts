/**
 * Shared keyboard helpers for the builder (Builder 2026 M3).
 *
 * Centralises "should the canvas shortcut handler run?" so edit-shell and
 * selection-layer stay consistent.
 */

/** True when focus is in an editable field — canvas shortcuts defer. */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable='true']")) return true;
  if (target.closest("[role='textbox']")) return true;
  return false;
}

/** True when the active element is inside edit chrome or the storefront canvas. */
export function keyboardFocusIsOnCanvas(): boolean {
  if (typeof document === "undefined") return true;
  const ae = document.activeElement;
  if (!ae || ae === document.body) return true;
  if (!(ae instanceof HTMLElement)) return true;
  if (ae.closest("[data-edit-chrome]")) return true;
  if (ae.closest("[data-edit-overlay]")) return true;
  if (ae.closest("[data-cms-section]")) return true;
  if (ae.closest("[data-builder-node-id]")) return true;
  return false;
}

export function hasNativeTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  const sel = window.getSelection();
  return Boolean(sel && sel.toString().length > 0);
}

/**
 * Undo / redo / Revisions chords (⌘Z, ⇧⌘Z, ⌘Y, ⇧⌘Y). Extracted from
 * edit-shell so the Revisions bind could land without growing that
 * ratchet-capped file.
 *
 * `key` is `e.key.toLowerCase()`. Returns true when this handler consumed
 * the event.
 */
export function tryHistoryShortcut(
  e: KeyboardEvent,
  mod: boolean,
  key: string,
  actions: {
    undo: () => void;
    redo: () => void | Promise<unknown>;
    openRevisions: () => void;
  },
): boolean {
  if (!mod) return false;
  if (key === "y" && !e.altKey) {
    e.preventDefault();
    if (e.shiftKey) actions.openRevisions();
    else void actions.redo();
    return true;
  }
  if (key === "z") {
    e.preventDefault();
    if (e.shiftKey) void actions.redo();
    else void actions.undo();
    return true;
  }
  return false;
}
