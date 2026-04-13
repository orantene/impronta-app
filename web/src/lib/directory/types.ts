/**
 * Directory discovery — API contract for infinite scroll + SSR first page.
 */

export const DIRECTORY_PAGE_SIZE_DEFAULT = 24;
export const DIRECTORY_PAGE_SIZE_MAX = 48;
export const DIRECTORY_SORT_VALUES = [
  "recommended",
  "featured",
  "recent",
  "updated",
] as const;

export type DirectorySortValue = (typeof DIRECTORY_SORT_VALUES)[number];

/**
 * Localized label + value for directory card trait lines.
 * Catalog eligibility: public_visible + profile_visible + card_visible (see directory-card-display-catalog).
 */
export type DirectoryCardAttributeDTO = {
  key: string;
  label: string;
  value: string;
};

/**
 * Public card row: fixed header slots (name, primary type, city) from profile/taxonomy/location columns,
 * not from arbitrary field_definitions. Trait lines + fit chips follow Admin field rules.
 */
export type DirectoryCardDTO = {
  id: string;
  profileCode: string;
  /** SEO slug segment; full path built in UI */
  slugPart: string | null;
  displayName: string;
  primaryTalentTypeLabel: string;
  locationLabel: string;
  fitLabels: readonly { slug: string; label: string }[];
  /** Traits to show under fit labels — from `card_visible` definitions (+ height when enabled). */
  cardAttributes: readonly DirectoryCardAttributeDTO[];
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  isFeatured: boolean;
  featuredLevel: number;
  /** Raw profile height; use `cardAttributes` for card UI when `height_cm` is card-visible. */
  heightCm: number | null;
  thumbnail: {
    url: string | null;
    width: number | null;
    height: number | null;
  };
};

export type DirectoryCursor = {
  offset: number;
};

export type DirectoryPageResponse = {
  items: DirectoryCardDTO[];
  nextCursor: string | null;
  /**
   * Exact total for the current filter set. Omitted on paginated API responses
   * (cursor pages) to avoid a COUNT(*) on every infinite-scroll request.
   */
  totalCount?: number;
  /** Echo for TanStack Query cache keys */
  taxonomyTermIds: string[];
};

export type DirectoryListParams = {
  limit?: number;
  cursor?: string | null;
  taxonomyTermIds?: string[];
  query?: string;
  locationSlug?: string;
  sort?: DirectorySortValue;
  /** Inclusive height (cm) on `talent_profiles.height_cm`; only applied when catalog enables height filter. */
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  /** Localized labels on card */
  locale?: "en" | "es";
  /** When true, skip COUNT(*) (used for cursor / infinite-scroll pages). */
  skipTotalCount?: boolean;
};
