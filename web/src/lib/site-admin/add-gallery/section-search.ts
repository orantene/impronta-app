import { ADD_GALLERY_ITEMS, isAddGalleryItemAvailable } from "./registry";
import type { AddGalleryItem } from "./types";

/** Lowercase, accent-free, for matching "reseña" against "resena". */
export function foldSearchText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Ready-made sections the main Add panel offers (template-backed, available). */
export function listSearchableSections(
  items: ReadonlyArray<AddGalleryItem> = ADD_GALLERY_ITEMS,
): AddGalleryItem[] {
  return items.filter(
    (i) => i.insertMethod === "sectionTemplate" && !!i.sectionTemplateId && isAddGalleryItemAvailable(i),
  );
}

/**
 * Structure "Add block" search: sections match by English name, Spanish name
 * (via `translate`, the editor's ES catalog) and description. Empty query
 * returns nothing: the picker only lists sections once the user types.
 */
export function searchSections(
  query: string,
  translate: (en: string) => string,
  items: ReadonlyArray<AddGalleryItem> = listSearchableSections(),
  limit = 8,
): AddGalleryItem[] {
  const q = foldSearchText(query);
  if (!q) return [];
  const out: AddGalleryItem[] = [];
  for (const item of items) {
    const hay = foldSearchText(
      [item.label, translate(item.label), item.description, item.sectionTemplateId ?? ""].join(" "),
    );
    if (hay.includes(q)) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
