import type { AddGalleryItem } from "./types";

export type GalleryItemInput = Pick<
  AddGalleryItem,
  "id" | "label" | "description" | "category" | "icon"
> &
  Partial<AddGalleryItem>;

export function el(
  partial: GalleryItemInput & { insertMethod: AddGalleryItem["insertMethod"] },
): AddGalleryItem {
  return {
    tab: "elements",
    previewType: "icon-card",
    itemKind: "static",
    dragSupported: true,
    availability: "available",
    sourceType: "native-freeform",
    ...partial,
  };
}

export function section(partial: GalleryItemInput): AddGalleryItem {
  return el({
    ...partial,
    tab: "sections",
    previewType: "image-card",
    insertMethod: partial.insertMethod ?? "sectionTemplate",
  });
}

export function connected(partial: GalleryItemInput): AddGalleryItem {
  return el({
    ...partial,
    tab: "connected",
    previewType: "icon-card",
    itemKind: "connected",
    insertMethod: partial.insertMethod ?? "connectedNode",
    sourceType: "section-embed",
  });
}

export function secEmbed(partial: GalleryItemInput): AddGalleryItem {
  return section({
    ...partial,
    insertMethod: "sectionEmbed",
    sourceType: "section-embed",
    itemKind: partial.itemKind ?? "static",
  });
}

export function roadmap(partial: GalleryItemInput): AddGalleryItem {
  return el({
    ...partial,
    insertMethod: "disabledComingSoon",
    availability: "coming-soon",
    sourceType: "coming-soon",
    dragSupported: false,
  });
}
