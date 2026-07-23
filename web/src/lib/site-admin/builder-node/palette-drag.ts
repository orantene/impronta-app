/**
 * Palette-drag payload contract (extracted W5-C2).
 *
 * The pure, framework-agnostic core of the "drag a palette item onto the
 * canvas" gesture: the custom drag MIME, the payload encode/decode, the
 * in-flight singleton holder, and the pointer-drag pub/sub bridge. It depends
 * only on `BuilderNodeKind` (lib), so it lives in `lib/site-admin/builder-node`
 * — both the edit-chrome palette UI (`element-library-insert-picker.tsx`) and
 * the lib add-gallery drag helper (`add-gallery/drag.ts`) import it from here,
 * which keeps `add-gallery/drag.ts` off the lib→edit-chrome cycle.
 */

import type { BuilderNodeKind } from "./types";

/**
 * P3-DRAG — custom drag MIME for "drag a palette item onto the canvas". Only
 * `selection-layer.tsx`'s canvas drop target reads it, so a palette drag never
 * collides with the navigator's `text/plain` section/child-row DnD. Payload is
 * `kind:<kind>` for a plain element or `embed:<sectionTypeKey>` for a Tulala
 * component. Exported so the canvas drop handler parses the exact same format.
 */
export const BUILDER_NODE_PALETTE_DRAG_MIME =
  "application/x-impronta-builder-node-palette";

export function encodeBuilderNodePaletteDrag(
  payload: BuilderNodePaletteDragPayload,
): string {
  if (payload.kind === "element") {
    return `kind:${payload.elementKind}`;
  }
  if (payload.kind === "section_embed") {
    return `embed:${payload.sectionTypeKey}`;
  }
  if (payload.kind === "gallery_item") {
    return `gallery:${payload.itemId}`;
  }
  return "";
}

export type BuilderNodePaletteDragPayload =
  | { kind: "element"; elementKind: BuilderNodeKind }
  | { kind: "section_embed"; sectionTypeKey: string }
  | { kind: "gallery_item"; itemId: string };

export function decodeBuilderNodePaletteDrag(
  raw: string | null | undefined,
): BuilderNodePaletteDragPayload | null {
  if (!raw) return null;
  if (raw.startsWith("kind:")) {
    const elementKind = raw.slice("kind:".length);
    if (!elementKind) return null;
    return { kind: "element", elementKind: elementKind as BuilderNodeKind };
  }
  if (raw.startsWith("embed:")) {
    const sectionTypeKey = raw.slice("embed:".length);
    if (!sectionTypeKey) return null;
    return { kind: "section_embed", sectionTypeKey };
  }
  if (raw.startsWith("gallery:")) {
    const itemId = raw.slice("gallery:".length);
    if (!itemId) return null;
    return { kind: "gallery_item", itemId };
  }
  return null;
}

/**
 * P3-DRAG — the payload of the palette drag CURRENTLY in flight. `dataTransfer`
 * data is unreadable during `dragover` (only `.types` is exposed), and the drag
 * source (a palette pill) lives in a different React tree from the canvas drop
 * target (selection-layer). This module-level holder bridges them: the pill
 * writes on `dragstart`, the canvas reads it on `dragenter`, and both clear it
 * on `dragend`. Single in-flight drag at a time, so a singleton is sufficient.
 */
let activePaletteDrag: BuilderNodePaletteDragPayload | null = null;

export function setActiveBuilderNodePaletteDrag(
  payload: BuilderNodePaletteDragPayload | null,
): void {
  activePaletteDrag = payload;
}

export function getActiveBuilderNodePaletteDrag(): BuilderNodePaletteDragPayload | null {
  return activePaletteDrag;
}

/**
 * CANVAS-6 — pointer-drag bridge between the gallery card (which arms the
 * palette payload via Pointer Events) and the canvas drop receiver
 * (selection-layer), which lives in a different React tree. HTML5 drag had the
 * browser fire `dragenter`/`dragover`/`drop` on the window for free; Pointer
 * Events don't, so the card publishes pointer-drag lifecycle phases here and the
 * canvas subscribes. Single in-flight drag at a time → a singleton listener set
 * is sufficient (mirrors `activePaletteDrag`).
 */
export type PalettePointerDragPhase =
  | { type: "move"; clientX: number; clientY: number }
  | { type: "drop"; clientX: number; clientY: number }
  | { type: "cancel" };

type PalettePointerDragListener = (phase: PalettePointerDragPhase) => void;

const palettePointerDragListeners = new Set<PalettePointerDragListener>();

export function subscribePalettePointerDrag(
  listener: PalettePointerDragListener,
): () => void {
  palettePointerDragListeners.add(listener);
  return () => palettePointerDragListeners.delete(listener);
}

export function emitPalettePointerDrag(phase: PalettePointerDragPhase): void {
  for (const listener of palettePointerDragListeners) listener(phase);
}
