import {
  getAddGalleryCardInfoTooltip,
  getAddGalleryCardShortDescription,
} from "./card-display";
import type { AddGalleryCategoryDef, AddGalleryItem } from "./types";
import {
  ADD_GALLERY_AVAILABLE_ITEMS,
  ADD_GALLERY_ROADMAP_ITEMS,
} from "./registry-catalog";

export const ADD_GALLERY_CATEGORIES: ReadonlyArray<AddGalleryCategoryDef> = [
  { id: "text", label: "Text", tab: "elements", icon: "text" },
  { id: "buttons", label: "Buttons", tab: "elements", icon: "buttons" },
  { id: "media", label: "Media", tab: "elements", icon: "media" },
  { id: "layout", label: "Layout", tab: "elements", icon: "layout" },
  { id: "cards", label: "Cards", tab: "elements", icon: "cards" },
  { id: "interactive", label: "Interactive", tab: "elements", icon: "interactive" },
  { id: "forms", label: "Forms", tab: "elements", icon: "forms" },
  { id: "marketing", label: "Marketing", tab: "elements", icon: "marketing" },
  { id: "utility", label: "Utility", tab: "elements", icon: "utility" },
  { id: "social-embed", label: "Social & Embed", tab: "elements", icon: "social" },
  { id: "hero", label: "Hero", tab: "sections", icon: "hero" },
  { id: "about", label: "About", tab: "sections", icon: "about" },
  { id: "services", label: "Services", tab: "sections", icon: "services" },
  { id: "gallery-section", label: "Gallery", tab: "sections", icon: "gallery" },
  { id: "featured-talent", label: "Featured Talent", tab: "sections", icon: "talent" },
  { id: "talent-roster", label: "Talent Roster", tab: "sections", icon: "roster" },
  { id: "testimonials", label: "Testimonials", tab: "sections", icon: "testimonials" },
  { id: "cta", label: "CTA", tab: "sections", icon: "cta" },
  { id: "faq", label: "FAQ", tab: "sections", icon: "faq" },
  { id: "contact", label: "Contact", tab: "sections", icon: "contact" },
  { id: "pricing", label: "Pricing", tab: "sections", icon: "pricing" },
  { id: "footer", label: "Footer", tab: "sections", icon: "footer" },
  { id: "talent", label: "Talent", tab: "connected", icon: "talent" },
  { id: "agency", label: "Agency", tab: "connected", icon: "agency" },
  { id: "directory", label: "Directory", tab: "connected", icon: "directory" },
  { id: "booking", label: "Booking & Inquiry", tab: "connected", icon: "booking" },
  { id: "dynamic", label: "Dynamic Data", tab: "connected", icon: "dynamic" },
];

export const ADD_GALLERY_ITEMS: ReadonlyArray<AddGalleryItem> = [
  ...ADD_GALLERY_AVAILABLE_ITEMS,
  ...ADD_GALLERY_ROADMAP_ITEMS,
];

const CATEGORY_LABEL_BY_ID = new Map(
  ADD_GALLERY_CATEGORIES.map((cat) => [cat.id, cat.label] as const),
);

export function isAddGalleryItemAvailable(item: AddGalleryItem): boolean {
  return item.availability === "available";
}

export function getAddGalleryItemById(id: string): AddGalleryItem | undefined {
  return ADD_GALLERY_ITEMS.find((item) => item.id === id);
}

function itemMatchesVisibility(
  item: AddGalleryItem,
  options?: { includeRoadmap?: boolean },
): boolean {
  if (isAddGalleryItemAvailable(item)) return true;
  return options?.includeRoadmap === true && item.availability === "coming-soon";
}

export function listAddGalleryCategoriesForTab(
  tab: AddGalleryItem["tab"],
  options?: { includeRoadmap?: boolean },
): ReadonlyArray<AddGalleryCategoryDef> {
  return ADD_GALLERY_CATEGORIES.filter((cat) => {
    if (cat.tab !== tab) return false;
    return ADD_GALLERY_ITEMS.some(
      (item) =>
        item.tab === tab &&
        item.category === cat.id &&
        itemMatchesVisibility(item, options),
    );
  });
}

function itemSearchHaystack(item: AddGalleryItem): string {
  const categoryLabel = CATEGORY_LABEL_BY_ID.get(item.category) ?? item.category;
  return [
    item.label,
    getAddGalleryCardShortDescription(item),
    getAddGalleryCardInfoTooltip(item) ?? "",
    item.description,
    item.infoTooltip ?? "",
    item.category,
    categoryLabel,
    item.tab,
    item.connectedSource ?? "",
    item.sectionTemplateId ?? "",
    item.sectionEmbedKey ?? "",
    item.nativeKind ?? "",
    ...(item.searchTerms ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function filterAddGalleryItems(input: {
  tab: AddGalleryItem["tab"];
  categoryId?: string;
  query?: string;
  includeRoadmap?: boolean;
}): ReadonlyArray<AddGalleryItem> {
  const q = input.query?.trim().toLowerCase() ?? "";
  const includeRoadmap = input.includeRoadmap ?? false;

  return ADD_GALLERY_ITEMS.filter((item) => {
    if (item.tab !== input.tab) return false;
    if (!itemMatchesVisibility(item, { includeRoadmap })) return false;
    if (!q && input.categoryId && item.category !== input.categoryId) {
      return false;
    }
    if (!q) return true;
    return itemSearchHaystack(item).includes(q);
  });
}
