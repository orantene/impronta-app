import {
  getAddGalleryCardInfoTooltip,
  getAddGalleryCardShortDescription,
} from "./card-display";
import type { AddGalleryCategoryDef, AddGalleryItem } from "./types";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";
import {
  ADD_GALLERY_AVAILABLE_ITEMS,
  ADD_GALLERY_ROADMAP_ITEMS,
} from "./registry-catalog";

// ONB-4 — curated recommended section IDs; the category is listed first in the
// Designs tab so operators land on the most-useful items immediately.
export const RECOMMENDED_SECTION_IDS: ReadonlyArray<string> = [
  "sec-hero-centered",
  "sec-hero-split",
  "sec-about-simple",
  "sec-services-grid",
  "sec-gallery-grid",
  "sec-cta-banner",
];

export const ADD_GALLERY_CATEGORIES: ReadonlyArray<AddGalleryCategoryDef> = [
  // ONB-4 — "Recommended" always first in the sections tab.
  { id: "recommended", label: "Recommended", tab: "designs", icon: "sparkle" },
  { id: "text", label: "Text", tab: "blocks", icon: "text" },
  { id: "buttons", label: "Buttons", tab: "blocks", icon: "buttons" },
  { id: "media", label: "Media", tab: "blocks", icon: "media" },
  { id: "layout", label: "Layout", tab: "blocks", icon: "layout" },
  // Backgrounds — pre-dressed containers (video / YouTube / image / gradient).
  // Sits on Blocks next to the raw Container it dresses, rather than
  // opening a whole new tab; see registry-catalog-backgrounds.ts for why.
  { id: "backgrounds", label: "Backgrounds", tab: "blocks", icon: "media" },
  { id: "cards", label: "Cards", tab: "blocks", icon: "cards" },
  { id: "interactive", label: "Interactive", tab: "blocks", icon: "interactive" },
  { id: "forms", label: "Forms", tab: "blocks", icon: "forms" },
  { id: "utility", label: "Utility", tab: "blocks", icon: "utility" },
  { id: "social-embed", label: "Social & Embed", tab: "blocks", icon: "social" },
  // WS-A A5 — shell-only interactive header widgets (search / account / inquiry /
  // favorites), surfaced as curated section_embed presets in the shell gallery.
  { id: "header-widgets", label: "Header Widgets", tab: "blocks", icon: "interactive" },
  { id: "hero", label: "Hero", tab: "designs", icon: "hero" },
  { id: "about", label: "About", tab: "designs", icon: "about" },
  { id: "services", label: "Services", tab: "designs", icon: "services" },
  { id: "gallery-section", label: "Gallery", tab: "designs", icon: "gallery" },
  { id: "featured-talent", label: "Featured Talent", tab: "designs", icon: "talent" },
  { id: "talent-roster", label: "Talent Roster", tab: "designs", icon: "roster" },
  { id: "testimonials", label: "Testimonials", tab: "designs", icon: "testimonials" },
  { id: "cta", label: "CTA", tab: "designs", icon: "cta" },
  { id: "faq", label: "FAQ", tab: "designs", icon: "faq" },
  { id: "contact", label: "Contact", tab: "designs", icon: "contact" },
  { id: "talent", label: "Talent", tab: "data", icon: "talent" },
  { id: "agency", label: "Agency", tab: "data", icon: "agency" },
  { id: "directory", label: "Directory", tab: "data", icon: "directory" },
  { id: "booking", label: "Booking & Inquiry", tab: "data", icon: "booking" },
  { id: "dynamic", label: "Dynamic Data", tab: "data", icon: "dynamic" },
];

// ONB-4 — synthetic "recommended" category items: alias the curated section
// items with category="recommended" so the gallery filter picks them up under
// the new category. IDs get a "rec:" prefix to avoid duplicate-key collisions
// with the originals; insertBuilderNode looks up the underlying item by its
// sectionTemplateId or nativeKind, not the gallery item id, so this is safe.
const RECOMMENDED_ITEMS: ReadonlyArray<AddGalleryItem> = ADD_GALLERY_AVAILABLE_ITEMS
  .filter((item) => RECOMMENDED_SECTION_IDS.includes(item.id))
  .map((item) => ({ ...item, id: `rec:${item.id}`, category: "recommended" }));

export const ADD_GALLERY_ITEMS: ReadonlyArray<AddGalleryItem> = [
  ...ADD_GALLERY_AVAILABLE_ITEMS,
  ...RECOMMENDED_ITEMS,
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

function humanizeCategoryId(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const FALLBACK_CATEGORY_ICON_BY_TAB: Record<AddGalleryItem["tab"], string> = {
  blocks: "layout",
  designs: "hero",
  data: "dynamic",
  shell: "layout",
};

/**
 * Categories present in an ARBITRARY item list for a tab (pure). Used by the
 * live gallery over the merged catalog (code ∪ DB templates). When
 * `synthesizeUnknownCategories` is set, any item whose `category` is not one of
 * the canonical `ADD_GALLERY_CATEGORIES` (e.g. a DB template with a free-text
 * category) gets its own synthesized rail entry so it is always reachable.
 * Without the flag the result is canonical-only (the legacy code-catalog behaviour).
 */
export function listGalleryCategoriesForTabFrom(
  items: ReadonlyArray<AddGalleryItem>,
  tab: AddGalleryItem["tab"],
  options?: { includeRoadmap?: boolean; synthesizeUnknownCategories?: boolean },
): ReadonlyArray<AddGalleryCategoryDef> {
  const visible = items.filter(
    (item) => item.tab === tab && itemMatchesVisibility(item, options),
  );
  const present = new Set(visible.map((item) => item.category));
  const canonical = ADD_GALLERY_CATEGORIES.filter(
    (cat) => cat.tab === tab && present.has(cat.id),
  );
  if (!options?.synthesizeUnknownCategories) return canonical;

  const covered = new Set(canonical.map((cat) => cat.id));
  const extras: AddGalleryCategoryDef[] = [];
  const seen = new Set<string>();
  for (const item of visible) {
    if (covered.has(item.category) || seen.has(item.category)) continue;
    seen.add(item.category);
    extras.push({
      id: item.category,
      label: humanizeCategoryId(item.category),
      tab,
      icon: FALLBACK_CATEGORY_ICON_BY_TAB[tab] ?? "sparkle",
    });
  }
  return [...canonical, ...extras];
}

export function listAddGalleryCategoriesForTab(
  tab: AddGalleryItem["tab"],
  options?: { includeRoadmap?: boolean },
): ReadonlyArray<AddGalleryCategoryDef> {
  return listGalleryCategoriesForTabFrom(ADD_GALLERY_ITEMS, tab, options);
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

/**
 * Filter an ARBITRARY item list by tab/category/search (pure). Used by the live
 * gallery over the merged catalog (code ∪ DB templates). `filterAddGalleryItems`
 * is the code-only convenience over `ADD_GALLERY_ITEMS`.
 */
export function filterGalleryItemsFrom(
  items: ReadonlyArray<AddGalleryItem>,
  input: {
    tab: AddGalleryItem["tab"];
    categoryId?: string;
    query?: string;
    includeRoadmap?: boolean;
    /**
     * Piece B slice 1c — restrict the catalog to these native node kinds (the
     * print vocabulary). Applies on WHATEVER tab is queried, because the print
     * vocabulary spans tabs — the QR block is a connected node on the Data tab,
     * the rest are on Blocks — so a blocks-only gate would drop the QR. A card
     * with no nativeKind is dropped, since a restricted surface takes native
     * blocks only. Undefined ⇒ no restriction (every web surface).
     */
    blockAllowList?: readonly BuilderNodeKind[];
  },
): ReadonlyArray<AddGalleryItem> {
  const q = input.query?.trim().toLowerCase() ?? "";
  const includeRoadmap = input.includeRoadmap ?? false;
  const allow = input.blockAllowList ? new Set(input.blockAllowList) : null;

  return items.filter((item) => {
    if (item.tab !== input.tab) return false;
    if (!itemMatchesVisibility(item, { includeRoadmap })) return false;
    if (allow && (item.nativeKind == null || !allow.has(item.nativeKind))) {
      return false;
    }
    if (!q && input.categoryId && item.category !== input.categoryId) {
      return false;
    }
    if (!q) return true;
    return itemSearchHaystack(item).includes(q);
  });
}

export function filterAddGalleryItems(input: {
  tab: AddGalleryItem["tab"];
  categoryId?: string;
  query?: string;
  includeRoadmap?: boolean;
  blockAllowList?: readonly BuilderNodeKind[];
}): ReadonlyArray<AddGalleryItem> {
  return filterGalleryItemsFrom(ADD_GALLERY_ITEMS, input);
}
