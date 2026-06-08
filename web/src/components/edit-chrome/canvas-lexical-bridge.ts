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

export function registerCanvasTextStylePatchFlusher(
  flusher: StylePatchFlusher | null,
): void {
  stylePatchFlusher = flusher;
}

/** Flush toolbar style tweaks that were deferred during inline canvas edit. */
export function flushCanvasTextStylePatches(): void {
  void stylePatchFlusher?.();
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
