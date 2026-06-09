import type { DragEvent } from "react";

import {
  BUILDER_NODE_PALETTE_DRAG_MIME,
  setActiveBuilderNodePaletteDrag,
  type BuilderNodePaletteDragPayload,
} from "@/components/edit-chrome/element-library-insert-picker";

import { galleryItemSupportsDrag, resolveAddGalleryInsertAction } from "./insert";
import { getAddGalleryItemById } from "./registry";
import type { AddGalleryItem } from "./types";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

export const ADD_GALLERY_DRAG_PREFIX = "gallery:";

export function encodeAddGalleryDrag(itemId: string): string {
  return `${ADD_GALLERY_DRAG_PREFIX}${itemId}`;
}

export function decodeAddGalleryDrag(
  raw: string | null | undefined,
): string | null {
  if (!raw?.startsWith(ADD_GALLERY_DRAG_PREFIX)) return null;
  const id = raw.slice(ADD_GALLERY_DRAG_PREFIX.length);
  return id || null;
}

export function galleryItemDragPayload(
  item: AddGalleryItem,
): BuilderNodePaletteDragPayload | null {
  if (!galleryItemSupportsDrag(item)) return null;
  return { kind: "gallery_item", itemId: item.id };
}

export function armAddGalleryDrag(
  event: DragEvent<HTMLElement>,
  item: AddGalleryItem,
): boolean {
  const payload = galleryItemDragPayload(item);
  if (!payload) return false;

  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(
    BUILDER_NODE_PALETTE_DRAG_MIME,
    encodeAddGalleryDrag(item.id),
  );
  event.dataTransfer.setData("text/plain", item.label);
  setActiveBuilderNodePaletteDrag(payload);
  return true;
}

export function clearAddGalleryDrag(): void {
  setActiveBuilderNodePaletteDrag(null);
}

/** Node kind used for canvas drop-policy when dragging a gallery item. */
export function galleryItemDragNodeKind(itemId: string): BuilderNodeKind {
  const item = getAddGalleryItemById(itemId);
  if (!item) return "section";
  const action = resolveAddGalleryInsertAction(item);
  if (action.type === "nativeNode") return action.node.kind;
  if (action.type === "sectionTemplate") return "container";
  if (action.type === "sectionEmbed" || action.type === "connectedNode") {
    return "section_embed";
  }
  return "section";
}

/** Full-width gallery blocks (sections, connected embeds) insert at page root. */
export function galleryItemInsertsAtPageRoot(itemId: string): boolean {
  const kind = galleryItemDragNodeKind(itemId);
  return kind === "section" || kind === "section_embed" || kind === "container";
}
