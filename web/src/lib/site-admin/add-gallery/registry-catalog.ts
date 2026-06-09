import type { AddGalleryItem } from "./types";
import { ADD_GALLERY_ELEMENT_ITEMS } from "./registry-catalog-elements";
import { ADD_GALLERY_SECTIONS_CONNECTED_ITEMS } from "./registry-catalog-sections-connected";
import { ADD_GALLERY_ROADMAP_ITEMS } from "./registry-roadmap";

/** Shipped gallery items — available for insert/drag. */
export const ADD_GALLERY_AVAILABLE_ITEMS: ReadonlyArray<AddGalleryItem> = [
  ...ADD_GALLERY_ELEMENT_ITEMS,
  ...ADD_GALLERY_SECTIONS_CONNECTED_ITEMS,
];

export { ADD_GALLERY_ROADMAP_ITEMS };
