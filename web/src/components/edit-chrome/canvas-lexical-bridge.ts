/**
 * Module bridge so canvas chrome outside LexicalComposer can dispatch
 * formatting commands during inline edit.
 */

import type { LexicalEditor } from "lexical";

let activeEditor: LexicalEditor | null = null;
const editorListeners = new Set<() => void>();

export interface CanvasToolbarBridgeHandlers {
  requestLink: () => void;
  requestColor: (anchor: HTMLElement) => void;
}

let toolbarHandlers: CanvasToolbarBridgeHandlers | null = null;
let pendingLinkRequest = false;

const overlayStyleListeners = new Set<(patch: Record<string, unknown>) => void>();

type StylePatchFlusher = () => void | Promise<void>;
let stylePatchFlusher: StylePatchFlusher | null = null;

/**
 * CANVAS-7B — inline-editor → node-history commit handoff.
 *
 * When an inline canvas text editor is open, ⌘Z/⌘⇧Z are owned by Lexical's own
 * text history (edit-shell's keyboard handler defers via
 * `isEditableKeyboardTarget`). The hazard is the SEAM right after the operator
 * leaves the editor: the overlay commits its text asynchronously
 * (`patchBuilderNodeProps` → `setPast`), and the `pastRef` mirror the undo
 * machine reads only updates on the NEXT React commit. A ⌘Z fired in that gap
 * would undo the PRIOR node operation and silently strip the freshly-typed
 * text from the timeline.
 *
 * This registry lets the open InlineEditor expose ONE synchronous-to-call
 * "commit any pending inline text into node history, then resolve" handle. The
 * EditContext undo/redo run it (and AWAIT it) before reading the history stack,
 * so the just-typed text is ALWAYS a recorded node-history entry before a
 * node-level undo can fire. One handle = one open overlay; deregistered on
 * unmount. A no-op when nothing is open.
 */
type InlineEditorCommitHandle = () => void | Promise<void>;
let inlineEditorCommitHandle: InlineEditorCommitHandle | null = null;

type StylePatchCanceller = () => void;
let stylePatchCanceller: StylePatchCanceller | null = null;

export function registerCanvasTextStylePatchFlusher(
  flusher: StylePatchFlusher | null,
): void {
  stylePatchFlusher = flusher;
}

/** Flush toolbar style tweaks that were deferred during inline canvas edit. */
export function flushCanvasTextStylePatches(): void {
  void stylePatchFlusher?.();
}

export function registerCanvasTextStylePatchCanceller(
  canceller: StylePatchCanceller | null,
): void {
  stylePatchCanceller = canceller;
}

/**
 * Drop a debounced toolbar style patch. Undo/redo and authoritative reloads
 * restore a tree that predates the patch, so flushing it would re-apply the
 * edit being reverted; only cancelling keeps the restored tree intact.
 */
export function cancelCanvasTextStylePatches(): void {
  stylePatchCanceller?.();
}

/**
 * CANVAS-7B — register the open InlineEditor's commit-to-history handle (or
 * `null` to clear it on unmount). At most one is registered at a time.
 */
export function registerInlineEditorCommit(
  handle: InlineEditorCommitHandle | null,
): void {
  inlineEditorCommitHandle = handle;
}

/** True while an inline text edit can still be committed to node history. */
export function hasPendingInlineEditorCommit(): boolean {
  return inlineEditorCommitHandle !== null;
}

/**
 * CANVAS-7B — commit any open inline text edit into the node-history timeline
 * and resolve once that commit (and its `setPast` push) has been applied. The
 * undo/redo machine awaits this BEFORE reading the history stack so the
 * operator's last typed text is never dropped on the first ⌘Z after leaving the
 * inline editor. No-op (resolves immediately) when no inline editor is open.
 */
export async function commitActiveInlineEditor(): Promise<void> {
  const handle = inlineEditorCommitHandle;
  if (!handle) return;
  await handle();
}

export function isCanvasInlineTextEditActive(): boolean {
  return activeEditor !== null;
}

export function setActiveCanvasLexicalEditor(editor: LexicalEditor | null): void {
  activeEditor = editor;
  for (const notify of editorListeners) notify();
}

export function getActiveCanvasLexicalEditor(): LexicalEditor | null {
  return activeEditor;
}

export function subscribeActiveCanvasLexicalEditor(listener: () => void): () => void {
  editorListeners.add(listener);
  return () => editorListeners.delete(listener);
}

export function registerCanvasToolbarBridge(
  handlers: CanvasToolbarBridgeHandlers | null,
): void {
  toolbarHandlers = handlers;
  if (handlers && pendingLinkRequest) {
    pendingLinkRequest = false;
    handlers.requestLink();
  }
}

export function requestCanvasToolbarLink(): void {
  if (toolbarHandlers) {
    toolbarHandlers.requestLink();
    return;
  }
  pendingLinkRequest = true;
}

export function requestCanvasToolbarColor(anchor: HTMLElement): void {
  toolbarHandlers?.requestColor(anchor);
}

export function notifyCanvasOverlayStylePatch(patch: Record<string, unknown>): void {
  for (const notify of overlayStyleListeners) notify(patch);
}

export function subscribeCanvasOverlayStylePatch(
  listener: (patch: Record<string, unknown>) => void,
): () => void {
  overlayStyleListeners.add(listener);
  return () => overlayStyleListeners.delete(listener);
}

/** Maps builder style patch keys to CSS properties on the inline overlay. */
export function canvasOverlayStyleFromPatch(
  patch: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (patch.align !== undefined) out.textAlign = String(patch.align);
  if (patch.fontSize !== undefined) out.fontSize = String(patch.fontSize);
  if (patch.fontFamily !== undefined) out.fontFamily = String(patch.fontFamily);
  if (patch.textColor !== undefined) out.color = String(patch.textColor);
  if (patch.fontWeight !== undefined) out.fontWeight = String(patch.fontWeight);
  if (patch.fontStyle !== undefined) out.fontStyle = String(patch.fontStyle);
  return out;
}
