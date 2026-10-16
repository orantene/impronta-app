import { ADD_GALLERY_ITEMS, isAddGalleryItemAvailable } from "./registry";
import type { AddGalleryItem } from "./types";

/** Lowercase, accent-free, for matching "reseña" against "resena". */
export function foldSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Extra EN/ES aliases beyond the catalog label + searchTerms. Structure "Add
 * block" must find the same sections the main Add panel does when the UI is
 * Spanish or when the user types a common synonym (TUL-80 / TUL-398).
 */
const SECTION_SEARCH_ALIASES: Readonly<Record<string, ReadonlyArray<string>>> = {
  "testimonials-trio": [
    "testimonials",
    "testimonial",
    "testimonios",
    "testimonio",
    "reseñas",
    "reseña",
    "reviews",
    "social proof",
    "prueba social",
  ],
  "faq-accordion": [
    "faq",
    "faqs",
    "questions",
    "preguntas",
    "pregunta",
    "acordeón",
    "acordeon",
    "preguntas frecuentes",
  ],
  gallery: ["gallery", "galería", "galeria", "photos", "fotos", "portfolio", "masonry"],
  "gallery-strip": ["gallery", "galería", "galeria", "strip", "mosaic", "fotos", "photos"],
  hero: ["hero", "portada", "banner", "cover"],
  about: ["about", "acerca", "sobre", "nosotros", "about us"],
  "about-split": ["about", "acerca", "sobre"],
  "about-stats": ["about", "stats", "cifras", "números", "numeros"],
  services: ["services", "servicios", "offerings"],
  "services-list": ["services", "servicios", "list"],
  cta: ["cta", "call to action", "banner", "conversion"],
  "cta-banner": ["cta", "call to action", "banner"],
  "cta-split": ["cta", "call to action", "split"],
  contact: ["contact", "contacto", "form"],
  "inquiry-cta": ["inquiry", "consulta", "contact", "contacto"],
};

/** Ready-made sections the main Add panel offers (template-backed, available). */
export function listSearchableSections(
  items: ReadonlyArray<AddGalleryItem> = ADD_GALLERY_ITEMS,
): AddGalleryItem[] {
  return items.filter(
    (i) => i.insertMethod === "sectionTemplate" && !!i.sectionTemplateId && isAddGalleryItemAvailable(i),
  );
}

function sectionHaystack(item: AddGalleryItem, translate: (en: string) => string): string {
  const key = item.sectionTemplateId ?? "";
  const aliases = SECTION_SEARCH_ALIASES[key] ?? [];
  return foldSearchText(
    [
      item.label,
      translate(item.label),
      item.description,
      key,
      item.category,
      ...(item.searchTerms ?? []),
      ...aliases,
    ].join(" "),
  );
}

/**
 * Structure "Add block" search: sections match by English name, UI-language
 * label (via `translate`), catalog `searchTerms`, and EN/ES aliases. Empty
 * query returns nothing: the picker only lists sections once the user types.
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
    if (sectionHaystack(item, translate).includes(q)) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
