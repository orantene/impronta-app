import { ADD_GALLERY_CARD_COPY, type AddGalleryCardCopy } from "./registry-card-copy";
import type { AddGalleryItem } from "./types";

export function getAddGalleryCardDisplay(item: AddGalleryItem): AddGalleryCardCopy {
  const copy = ADD_GALLERY_CARD_COPY[item.id];
  if (copy) return copy;
  return {
    description: item.description,
    infoTooltip: item.infoTooltip,
  };
}

/** One-line scan text shown on the card face. */
export function getAddGalleryCardShortDescription(item: AddGalleryItem): string {
  return getAddGalleryCardDisplay(item).description.trim() || item.description.trim();
}

/** Deeper guidance — info popover only, not duplicated on the card face. */
export function getAddGalleryCardInfoTooltip(item: AddGalleryItem): string | undefined {
  const display = getAddGalleryCardDisplay(item);
  const detail = (display.infoTooltip ?? item.infoTooltip ?? "").trim();
  if (detail) return detail;
  const summary = display.description.trim();
  if (summary && summary !== item.description.trim()) return summary;
  return undefined;
}
