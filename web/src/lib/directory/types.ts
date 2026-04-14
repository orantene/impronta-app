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
  /** Directory sort / tie-break (lower = higher priority). */
  featuredPosition: number;
  /** Soft ranking signal (Phase 10); not shown on the public card. */
  profileCompletenessScore: number;
  /** Curated ordering override when set (Phase 10 / ranking_signals §5). */
  manualRankOverride: number | null;
  /** Raw profile height; use `cardAttributes` for card UI when `height_cm` is card-visible. */
  heightCm: number | null;
  thumbnail: {
    url: string | null;
    width: number | null;
    height: number | null;
  };
  /** Why this match — overlap between active filters and profile data (classic directory). */
  filterMatchLabels?: readonly string[];
};

/**
 * `mode: classic_after_hybrid` — page 2+ uses classic ordering from `offset` after a hybrid first page (see docs/search-modes.md).
 */
export type DirectoryCursor = {
  offset: number;
  mode?: "classic_after_hybrid";
  /** Fingerprint of query + filters when `mode` is set (see `computeHybridContextStamp`). */
  hybridContextStamp?: string;
};

/** Client-only overlay when the listing came from hybrid `/api/ai/search`. */
export type DirectoryAiCardOverlay = {
  explanationLines: { id: string; text: string }[];
  confidenceNote: string | null;
  /** Cosine similarity 0–1 when vector leg ran for this result. */
  vectorSimilarity?: number | null;
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
  /** Present when items were produced from AI search with explanations enabled. */
  aiOverlayByTalentId?: Record<string, DirectoryAiCardOverlay>;
};

/** URL `ff` facet: OR within `values`, AND across different `fieldKey`s. */
export type DirectoryFieldFacetSelection = {
  fieldKey: string;
  values: string[];
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
  /** Age range filter (integer years); converted to date_of_birth range server-side. */
  ageMin?: number | null;
  ageMax?: number | null;
  /** Boolean, text-enum (`filter_options`), and canonical profile gender (`ff` URL param). */
  fieldFacetFilters?: DirectoryFieldFacetSelection[];
  /** Localized labels on card */
  locale?: "en" | "es";
  /** When true, skip COUNT(*) (used for cursor / infinite-scroll pages). */
  skipTotalCount?: boolean;
};
